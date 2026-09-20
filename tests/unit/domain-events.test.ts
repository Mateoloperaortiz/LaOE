import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type DomainEventDefinition, defineEvent, eventOf } from "@/domain-events/define";
import { getHandlers, onEvent, onEvents, resetHandlersForTests } from "@/jobs/registry";

const CATALOG_DIR = "src/domain-events";
// La línea de tiempo de crm todavía lista los eventos por nombre; migra en su propio tramo (ADR-084).
const STILL_BY_NAME = new Set(["src/modules/crm/domain/timeline-pure.ts"]);

async function catalog(): Promise<DomainEventDefinition[]> {
  const definitions: DomainEventDefinition[] = [];
  for (const file of readdirSync(CATALOG_DIR)) {
    if (file === "define.ts") continue;
    const exported: Record<string, unknown> = await import(
      `@/domain-events/${file.replace(/\.ts$/, "")}`
    );
    for (const value of Object.values(exported)) {
      if (value && typeof value === "object" && "type" in value && "schema" in value) {
        definitions.push(value as DomainEventDefinition);
      }
    }
  }
  return definitions;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const log = { info() {}, warn() {}, debug() {}, error() {} } as never;
const jobContext = { id: "outbox-sintetico", attempt: 1, log };

afterEach(() => resetHandlersForTests());

describe("catálogo de eventos de dominio", () => {
  it("no repite un tipo", async () => {
    const types = (await catalog()).map((definition) => definition.type);
    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types).size).toBe(types.length);
  });

  it("un tipo catalogado no se emite ni se escucha como cadena suelta", async () => {
    const types = (await catalog()).map((definition) => definition.type);
    const loose: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("scripts")]) {
      if (file.startsWith(CATALOG_DIR) || STILL_BY_NAME.has(file)) continue;
      // Una acción de auditoría puede llamarse igual que un evento: es otro espacio de nombres. La
      // línea puede traer el valor directo o elegirlo con un condicional (`action: won ? "…" : "…"`).
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/\baction:\s/.test(line));
      for (const type of types) {
        if (lines.some((line) => line.includes(`"${type}"`))) loose.push(`${file}: "${type}"`);
      }
    }
    expect(loose).toEqual([]);
  });
});

describe("eventOf, onEvent y onEvents", () => {
  const ping = defineEvent("test.ping", z.object({ id: z.string().min(1), n: z.number().int() }));
  const pong = defineEvent("test.pong", z.object({ id: z.string().min(1) }));

  it("eventOf arma el evento con su clave de deduplicación solo cuando la hay", () => {
    expect(eventOf(ping, { id: "a", n: 1 })).toEqual({
      type: "test.ping",
      payload: { id: "a", n: 1 },
    });
    expect(eventOf(pong, { id: "a" }, { dedupeKey: "k" })).toEqual({
      type: "test.pong",
      payload: { id: "a" },
      dedupeKey: "k",
    });
  });

  it("onEvent entrega el payload validado y falla el intento si no cumple el contrato", async () => {
    const seen: unknown[] = [];
    onEvent(ping, async (payload) => {
      seen.push(payload);
    });
    const [handler] = getHandlers("test.ping");
    await handler?.({ id: "a", n: 2, extra: "se descarta" }, jobContext);
    expect(seen).toEqual([{ id: "a", n: 2 }]);
    expect(() => handler?.({ id: "", n: 2 }, jobContext)).toThrow();
  });

  it("onEvents registra el mismo handler para cada evento y le dice cuál lo disparó", async () => {
    const seen: string[] = [];
    onEvents([ping, pong], async ({ id }, _ctx, type) => {
      seen.push(`${type}:${id}`);
    });
    await getHandlers("test.ping")[0]?.({ id: "a", n: 1 }, jobContext);
    await getHandlers("test.pong")[0]?.({ id: "b" }, jobContext);
    expect(seen).toEqual(["test.ping:a", "test.pong:b"]);
  });
});

describe("contratos de participation y de comms", () => {
  it("un logro puede no tener término ni traer booster", async () => {
    const { badgeUnlocked } = await import("@/domain-events/participation");
    const base = {
      achievementId: "a1",
      personId: "p1",
      badgeId: "b1",
      code: "EDICION-ESPECIAL",
      family: "SPECIAL",
      level: 2,
      name: "Edición especial",
      historical: false,
    };
    expect(badgeUnlocked.schema.parse({ ...base, termId: null, boosterKind: null })).toMatchObject({
      termId: null,
      boosterKind: null,
    });
    expect(() => badgeUnlocked.schema.parse(base)).toThrow();
  });

  it("un premio revertido viene de una entrega o de un check-in, y el otro va en null", async () => {
    const { challengeRewardReversed } = await import("@/domain-events/participation");
    const base = { personId: "p1", termId: "t1", rewardId: "r1" };
    expect(() =>
      challengeRewardReversed.schema.parse({ ...base, participationId: "x", checkInId: null }),
    ).not.toThrow();
    expect(() =>
      challengeRewardReversed.schema.parse({ ...base, participationId: null, checkInId: "c" }),
    ).not.toThrow();
    expect(() => challengeRewardReversed.schema.parse(base)).toThrow();
  });

  it("la audiencia de un reto viaja como texto: un valor nuevo no manda el evento a dead letter", async () => {
    const { challengePublished } = await import("@/domain-events/participation");
    expect(() =>
      challengePublished.schema.parse({
        challengeId: "c1",
        termId: "t1",
        title: "Reto",
        kind: "MISSION",
        closesAt: "2026-10-01T00:00:00.000Z",
        audience: "AUDIENCIA_FUTURA",
        audienceCommitteeIds: [],
        basePoints: 10,
      }),
    ).not.toThrow();
  });

  it("el pedido de notificación es de comms: su tipo sí es un enumerado y el tope es compartido", async () => {
    const { notificationRequested, NOTIFICATION_MAX_RECIPIENTS } = await import(
      "@/domain-events/comms"
    );
    const pedido = {
      kind: "REMINDER",
      recipients: [{ personId: "p1" }],
      title: "Hoy",
      url: "/app",
      dedupeKey: "k",
    };
    expect(notificationRequested.schema.parse(pedido)).toMatchObject({ body: "" });
    expect(() => notificationRequested.schema.parse({ ...pedido, kind: "OTRO" })).toThrow();
    const demasiados = Array.from({ length: NOTIFICATION_MAX_RECIPIENTS + 1 }, (_, n) => ({
      personId: `p${n}`,
    }));
    expect(() =>
      notificationRequested.schema.parse({ ...pedido, recipients: demasiados }),
    ).toThrow();
  });
});
