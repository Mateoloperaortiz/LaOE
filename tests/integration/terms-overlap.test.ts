import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { auditLog } from "@/modules/system/schema";
import {
  createTerm,
  ensureNextTerm,
  findTermByCode,
  getTerm,
  listAllTerms,
  updateTerm,
} from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { holdCommand, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";

// Dos términos no comparten un día (ADR-118 regla 26): el término vigente se deriva de la fecha
// (ADR-004), así que un solape deja a `findTermContaining` eligiendo uno sin que nadie lo decida.

const input = (code: string, startsOn: string, endsOn: string) => ({
  code,
  startsOn,
  endsOn,
  requiredOrdinaryAssemblies: 1,
  permanenceGeneralNominal: 50,
  permanenceCommitteeNominal: 60,
});

const create = (code: string, startsOn: string, endsOn: string) =>
  runCommand(SYSTEM_ACTOR, (ctx) => createTerm(ctx, input(code, startsOn, endsOn)));

const update = (id: string, code: string, startsOn: string, endsOn: string) =>
  runCommand(SYSTEM_ACTOR, (ctx) => updateTerm(ctx, id, input(code, startsOn, endsOn)));

const overlap = (code: string) => t("T-3254", { término: code });

async function codes(): Promise<string[]> {
  return (await listAllTerms()).map((row) => row.code).sort();
}

async function audits(action: string): Promise<number> {
  const rows = await getDb()
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(eq(auditLog.action, action));
  return rows.length;
}

describe("términos sin solape", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crear un término que pisa las fechas de otro responde el error del solape y no lo crea", async () => {
    await create("2026-1", "2026-01-20", "2026-06-06");
    // Comparte un solo día: el último del anterior.
    await expect(create("2026-2", "2026-06-06", "2026-11-28")).rejects.toThrow(overlap("2026-1"));
    // Lo contiene entero.
    await expect(create("2025-2", "2025-07-01", "2026-12-31")).rejects.toThrow(overlap("2026-1"));
    // Queda adentro.
    const inside = create("2027-1", "2026-03-01", "2026-04-01");
    await expect(inside).rejects.toBeInstanceOf(DomainError);
    await expect(inside).rejects.toThrow(overlap("2026-1"));
    expect(await codes()).toEqual(["2026-1"]);
    expect(await audits("term.created")).toBe(1);
  });

  it("editar un término para que pise a otro responde el mismo error y no lo mueve", async () => {
    await create("2026-1", "2026-01-20", "2026-06-06");
    const second = await create("2026-2", "2026-07-13", "2026-11-28");
    await expect(update(second.id, "2026-2", "2026-06-01", "2026-11-28")).rejects.toThrow(
      overlap("2026-1"),
    );
    expect(await getTerm(second.id)).toMatchObject({
      startsOn: "2026-07-13",
      endsOn: "2026-11-28",
    });
    expect(await audits("term.updated")).toBe(0);
  });

  it("dos altas a la vez sobre las mismas fechas: la segunda espera a la primera y recibe el error", async () => {
    const held = await holdCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, input("2026-1", "2026-01-20", "2026-06-06")),
    );
    const second = create("2026-2", "2026-06-01", "2026-11-28");
    void second.catch(() => undefined);
    try {
      // Hace cola por el candado del calendario: todavía no puede ver el término sin confirmar.
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(second).rejects.toThrow(overlap("2026-1"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, second]);
    }
    expect(await codes()).toEqual(["2026-1"]);
    expect(await audits("term.created")).toBe(1);
  });

  it("dos ediciones a la vez que solo se pisan entre sí: la segunda recibe el error", async () => {
    const first = await create("2026-1", "2026-01-20", "2026-06-06");
    const second = await create("2026-2", "2026-07-13", "2026-11-28");
    // Cada una vale contra lo confirmado; juntas dejarían del 15 al 30 de junio en los dos términos.
    const held = await holdCommand(SYSTEM_ACTOR, (ctx) =>
      updateTerm(ctx, first.id, input("2026-1", "2026-01-20", "2026-06-30")),
    );
    const other = update(second.id, "2026-2", "2026-06-15", "2026-11-28");
    void other.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(other).rejects.toThrow(overlap("2026-1"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, other]);
    }
    expect(await getTerm(first.id)).toMatchObject({ endsOn: "2026-06-30" });
    expect(await getTerm(second.id)).toMatchObject({ startsOn: "2026-07-13" });
    expect(await audits("term.updated")).toBe(1);
  });

  // Decisión abierta 27: si se admiten huecos entre términos y qué campos de un término cerrado se
  // pueden editar no está decidido. Esta prueba fija lo de hoy: los huecos se admiten y un término
  // se edita entero, cerrado o no, mientras no pise a otro.
  it("términos pegados o con hueco se admiten, y un término se edita sin chocar consigo mismo (decisión abierta 27)", async () => {
    const first = await create("2026-1", "2026-01-20", "2026-06-30");
    await create("2026-2", "2026-07-01", "2026-11-28");
    await create("2027-1", "2027-02-01", "2027-06-05");
    expect(await codes()).toEqual(["2026-1", "2026-2", "2027-1"]);
    // Cerrado en puntos y en permanencia: la edición sigue pasando, como hoy.
    await getDb()
      .update(term)
      .set({ pointsClosedAt: new Date(), permanenceClosedAt: new Date() })
      .where(eq(term.id, first.id));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateTerm(ctx, first.id, {
        ...input("2026-1", "2026-01-19", "2026-06-30"),
        requiredOrdinaryAssemblies: 2,
      }),
    );
    expect(await getTerm(first.id)).toMatchObject({
      startsOn: "2026-01-19",
      requiredOrdinaryAssemblies: 2,
    });
  });

  it("el código repetido sigue respondiendo su propio error, también con las mismas fechas", async () => {
    await create("2026-1", "2026-01-20", "2026-06-06");
    const second = await create("2026-2", "2026-07-13", "2026-11-28");
    await expect(create("2026-1", "2026-01-20", "2026-06-06")).rejects.toThrow(t("T-293"));
    await expect(update(second.id, "2026-1", "2026-01-20", "2026-06-06")).rejects.toThrow(
      t("T-293"),
    );
    expect(await codes()).toEqual(["2026-1", "2026-2"]);
  });

  // Decisión abierta 48: qué hace la casa cuando tiene que crear sola el término siguiente y sus
  // fechas convencionales pisan uno que existe. Hoy no lo crea y responde el error del solape.
  it("el término siguiente que la casa crea sola no pisa a ninguno: responde el error y no lo crea (decisión abierta 48)", async () => {
    const current = await create("2026-2", "2026-07-13", "2027-01-17");
    const row = await getTerm(current.id);
    if (!row) throw new Error("sin término");
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => ensureNextTerm(ctx, row))).rejects.toThrow(
      overlap("2026-2"),
    );
    expect(await findTermByCode("2027-1")).toBeNull();
  });
});
