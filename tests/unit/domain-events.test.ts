import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type DomainEventDefinition, defineEvent, eventOf } from "@/domain-events/define";
import { getHandlers, onEvent, onEvents, resetHandlersForTests } from "@/jobs/registry";

const CATALOG_DIR = "src/domain-events";

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
const jobContext = { id: "outbox-sintetico", attempt: 1, log, now: new Date(0) };

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
      if (file.startsWith(CATALOG_DIR)) continue;
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

  it("el vencimiento de un pedido de notificación es opcional, y si viene es un instante ISO en UTC", async () => {
    const { notificationRequested } = await import("@/domain-events/comms");
    const pedido = {
      kind: "REMINDER",
      recipients: [{ personId: "p1" }],
      title: "Hoy",
      url: "/app",
      dedupeKey: "k",
    };
    // Sin él pasa, y no nace con un valor por defecto: así llegan los pedidos de la versión anterior.
    expect(notificationRequested.schema.parse(pedido)).not.toHaveProperty("expiresAt");
    expect(
      notificationRequested.schema.parse({ ...pedido, expiresAt: "2026-09-14T23:00:00.000Z" }),
    ).toMatchObject({ expiresAt: "2026-09-14T23:00:00.000Z" });
    for (const ilegible of ["", "mañana a las seis", "2026-09-14", "2026-09-14T18:00:00-05:00"]) {
      expect(
        () => notificationRequested.schema.parse({ ...pedido, expiresAt: ilegible }),
        ilegible,
      ).toThrow();
    }
    // Un campo que esta versión no conoce no hace fallar el pedido: por eso el poller anterior, que no
    // conoce el vencimiento, sigue entregando lo que encola el nuevo mientras dura un despliegue.
    expect(() =>
      notificationRequested.schema.parse({ ...pedido, campoDeOtraVersion: 1 }),
    ).not.toThrow();
  });
});

describe("contratos de permanence", () => {
  it("el recálculo es de un término y, si viene, de una sola persona", async () => {
    const { permanenceRecompute } = await import("@/domain-events/permanence");
    expect(permanenceRecompute.schema.parse({ termId: "t1" })).toEqual({ termId: "t1" });
    expect(permanenceRecompute.schema.parse({ termId: "t1", personId: "p1" })).toEqual({
      termId: "t1",
      personId: "p1",
    });
    expect(() => permanenceRecompute.schema.parse({ personId: "p1" })).toThrow();
  });

  it("la decisión por persona no tiene comité y la puede tomar el sistema", async () => {
    const { permanenceDecided } = await import("@/domain-events/permanence");
    const fila = {
      actorId: null,
      personId: "p1",
      termId: "t1",
      committeeId: null,
      decision: "CONTINUES",
      reason: "",
    };
    expect(() => permanenceDecided.schema.parse(fila)).not.toThrow();
    expect(() =>
      permanenceDecided.schema.parse({ ...fila, decision: "DECISION_FUTURA" }),
    ).not.toThrow();
    const { committeeId: _sinComite, ...incompleta } = fila;
    expect(() => permanenceDecided.schema.parse(incompleta)).toThrow();
  });

  it("la importación histórica registra una evaluación sin saber quién evaluó", async () => {
    const { evaluationRecorded } = await import("@/domain-events/permanence");
    expect(() =>
      evaluationRecorded.schema.parse({
        actorId: "admin",
        personId: "p1",
        termId: "t1",
        groupId: "g1",
        groupName: "Tarea de nuevos",
        kind: "NEW_MEMBER_TASK",
        evaluation: "GOOD",
        note: "Importado",
      }),
    ).not.toThrow();
  });
});

describe("contratos de crm, identity, content, forms, wallet, comms y system", () => {
  it("el programado de la billetera llega sin cursor y su payload de scheduler se descarta", async () => {
    const { walletReconcile } = await import("@/domain-events/wallet");
    expect(
      walletReconcile.schema.parse({ scheduled: "wallet", at: "2026-09-20T05:05:00.000Z" }),
    ).toEqual({});
    expect(walletReconcile.schema.parse({ cursor: "pase-100" })).toEqual({ cursor: "pase-100" });
  });

  it("una tarjeta es de una persona o de una organización", async () => {
    const { cardCreated } = await import("@/domain-events/crm");
    const base = {
      actorId: "admin",
      cardId: "c1",
      pipelineId: "p1",
      pipelineName: "Aliados",
      stageName: "Contacto",
    };
    expect(() =>
      cardCreated.schema.parse({ ...base, personId: null, organizationId: "o1" }),
    ).not.toThrow();
    expect(() =>
      cardCreated.schema.parse({ ...base, personId: "x", organizationId: null }),
    ).not.toThrow();
    expect(() => cardCreated.schema.parse(base)).toThrow();
  });

  it("una respuesta puede venir de alguien sin sesión y deja pasar las acciones que no conoce", async () => {
    const { submissionReceived } = await import("@/domain-events/forms");
    const parsed = submissionReceived.schema.parse({
      actorId: null,
      submissionId: "s1",
      formId: "f1",
      formTitle: "Inscripción",
      formSlug: "inscripcion",
      personId: null,
      email: "alguien@example.com",
      actions: { createPerson: true, tagIds: ["t1"], editionId: "e1" },
    });
    expect(parsed.actions).toMatchObject({ editionId: "e1", tagIds: ["t1"] });
  });

  it("el primer ADMIN lo otorga el sistema y un permiso global no tiene comité", async () => {
    const { permissionGranted } = await import("@/domain-events/identity");
    expect(() =>
      permissionGranted.schema.parse({
        actorId: null,
        personId: "p1",
        code: "ADMIN",
        committeeId: null,
      }),
    ).not.toThrow();
  });

  it("una convocatoria puede no tener cupo y un anuncio puede no tener comité", async () => {
    const { callOpened } = await import("@/domain-events/crm");
    const { announcementPushRequested } = await import("@/domain-events/content");
    expect(() =>
      callOpened.schema.parse({
        callId: "c1",
        termId: "t1",
        groupId: "g1",
        title: "Barra",
        closesAt: "2026-10-01T00:00:00.000Z",
        capacity: null,
        actorId: "admin",
      }),
    ).not.toThrow();
    expect(() =>
      announcementPushRequested.schema.parse({
        announcementId: "a1",
        title: "Anuncio",
        excerpt: "",
        audience: "MEMBERS",
        committeeId: null,
        url: "/app/cartelera/a1",
        actorId: "admin",
      }),
    ).not.toThrow();
  });
});
