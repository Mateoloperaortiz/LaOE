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
      // Una acción de auditoría puede llamarse igual que un evento: es otro espacio de nombres.
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !/\baction:\s*"/.test(line));
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
