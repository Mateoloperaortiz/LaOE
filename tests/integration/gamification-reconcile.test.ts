import { and, eq, isNull } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import * as badges from "@/modules/participation/domain/badges";
import {
  getReconciliationRun,
  processReconciliationBatch,
  resumeReconciliation,
  startReconciliation,
} from "@/modules/participation/domain/reconciliation";
import { achievement, boosterItem, checkIn } from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { seedCheckIn, seedMember, seedOccasion, seedTerm, seedWordleGame } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Conciliación histórica (ADR-067 reglas 11 y 13): el barrido por lotes reconoce insignias por
// hechos de cualquier semestre — importados incluidos, reuniones de comité no — sin puntos,
// boosters ni avisos; es idempotente, reanudable por cursor y con una sola corrida a la vez.

const db = () => getDb();

async function startRun(mode: "DRY_RUN" | "APPLY"): Promise<string> {
  const { id } = await runCommand(SYSTEM_ACTOR, (ctx) => startReconciliation(ctx, { mode }));
  return id;
}

async function seedImportedCheckIn(occasionId: string, personId: string, at: Date) {
  const id = await seedCheckIn(occasionId, personId, "APPROVED", { source: "IMPORT", at });
  const [row] = await db().select().from(checkIn).where(eq(checkIn.id, id));
  if (!row) throw new Error("seed import");
  return row;
}

async function seedWordleWin(personId: string, termId: string, at: Date) {
  await seedWordleGame(personId, termId, "2024-05-10", { status: "WON", completedAt: at });
}

/** Tres miembros: uno con una asistencia voluntaria importada de 2023-1 (más una reunión de
 * comité que no cuenta), uno con un Wordle ganado y uno sin hechos. */
async function seedUniverse() {
  const termId = await seedTerm();
  const oldTermId = await seedTerm("2023-1");
  const asistente = await seedMember("rec.asistente@test.dev", { entryTermCode: "2023-1" });
  const voluntary = await seedOccasion(oldTermId, { points: 10 });
  const meeting = await seedOccasion(oldTermId, { category: "COMMITTEE_MEETING", points: 0 });
  const fact = await seedImportedCheckIn(voluntary.id, asistente, new Date("2023-03-10T15:00:00Z"));
  await seedImportedCheckIn(meeting.id, asistente, new Date("2023-03-11T15:00:00Z"));
  const wordlero = await seedMember("rec.wordle@test.dev");
  const wordleAt = new Date("2024-05-10T20:00:00Z");
  await seedWordleWin(wordlero, termId, wordleAt);
  const sinHechos = await seedMember("rec.nada@test.dev");
  return { asistente, wordlero, sinHechos, fact, wordleAt };
}

describe("conciliación histórica", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("DRY_RUN no escribe logros y termina DONE con las cifras", async () => {
    await seedUniverse();
    const runId = await startRun("DRY_RUN");
    await drainOutbox();

    const run = await getReconciliationRun(runId);
    expect(run?.status).toBe("DONE");
    // Uno por En parche 1 (asistente) y uno por Palabra a palabra 1 (wordlero); la reunión no cuenta.
    expect(run?.unlocked).toBe(2);
    expect(run?.revoked).toBe(0);
    expect(run?.processed).toBe(3);
    expect(await db().select().from(achievement)).toEqual([]);
  });

  it("APPLY inserta logros históricos sin booster, sin push y sin línea de tiempo", async () => {
    const { asistente, wordlero, fact, wordleAt } = await seedUniverse();
    const runId = await startRun("APPLY");
    await drainOutbox();

    const run = await getReconciliationRun(runId);
    expect(run?.status).toBe("DONE");
    expect(run?.unlocked).toBe(2);

    const rows = await db().select().from(achievement);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.historical)).toBe(true);
    const porAsistencia = rows.find((row) => row.personId === asistente);
    const porWordle = rows.find((row) => row.personId === wordlero);
    expect(porAsistencia?.unlockedAt).toEqual(fact.at);
    expect(porAsistencia?.sourceKind).toBe("CHECKIN");
    expect(porWordle?.unlockedAt).toEqual(wordleAt);
    expect(porWordle?.sourceKind).toBe("WORDLE");

    // Histórico: ni booster_item, ni message de comms, ni interaction de crm (ADR-067 regla 13).
    expect(await db().select().from(boosterItem)).toEqual([]);
    expect(await db().select().from(message)).toEqual([]);
    expect(await db().select().from(interaction)).toEqual([]);
  });

  it("una segunda APPLY no desbloquea nada ni duplica logros", async () => {
    await seedUniverse();
    await startRun("APPLY");
    await drainOutbox();
    const segundo = await startRun("APPLY");
    await drainOutbox();

    const run = await getReconciliationRun(segundo);
    expect(run?.status).toBe("DONE");
    expect(run?.unlocked).toBe(0);
    expect(run?.revoked).toBe(0);
    expect(await db().select().from(achievement)).toHaveLength(2);
  });

  it("revoca el logro cuando el hecho desaparece", async () => {
    const { asistente, fact } = await seedUniverse();
    await startRun("APPLY");
    await drainOutbox();

    await db().update(checkIn).set({ status: "CANCELLED" }).where(eq(checkIn.id, fact.id));
    const runId = await startRun("APPLY");
    await drainOutbox();

    const run = await getReconciliationRun(runId);
    expect(run?.status).toBe("DONE");
    expect(run?.revoked).toBe(1);
    const live = await db()
      .select()
      .from(achievement)
      .where(and(eq(achievement.personId, asistente), isNull(achievement.revokedAt)));
    expect(live).toEqual([]);
  });

  it("rechaza una segunda corrida mientras otra está en curso", async () => {
    await seedUniverse();
    await startRun("DRY_RUN");
    await expect(startRun("APPLY")).rejects.toSatisfy(
      (error) => error instanceof DomainError && error.message === t("T-2561"),
    );
    await drainOutbox();
    // Una vez DONE vuelve a poder arrancar.
    await expect(startRun("APPLY")).resolves.toBeTypeOf("string");
  });

  it("encadena lotes con claves distintas y reporta batches", async () => {
    await seedUniverse();
    const runId = await startRun("APPLY");
    // Primer lote forzado a 2: quedan pendientes el evento inicial (:0) y el encadenado (:1).
    const first = await processReconciliationBatch(runId, 2);
    expect(first).toEqual({ processed: 2, done: false });

    const keys = await db()
      .select({ key: outbox.dedupeKey })
      .from(outbox)
      .where(eq(outbox.eventType, "gamification.reconcile"));
    expect(new Set(keys.map((row) => row.key)).size).toBe(keys.length);
    expect(keys.map((row) => row.key).sort()).toEqual([
      `reconcile:${runId}:0`,
      `reconcile:${runId}:1`,
    ]);

    await drainOutbox();
    const run = await getReconciliationRun(runId);
    expect(run?.status).toBe("DONE");
    expect(run?.processed).toBe(3);
    expect(
      (run?.report as { batches?: number } | null)?.batches,
      "dos lotes: el manual de 2 y el que drenó el resto",
    ).toBe(2);
  });

  it("el error de una corrida FAILED se guarda sin los valores de la consulta que falló, en la corrida y en su auditoría", async () => {
    // Lo que tumba un lote suele ser una consulta, y Drizzle escribe sus valores en el mensaje del
    // error: quedaban en `badge_reconciliation_run.error`, a la vista en el admin, y en la auditoría
    // (DT-295 inciso i, ADR-120 regla 11).
    await seedUniverse();
    const runId = await startRun("APPLY");
    const query = 'select "id" from "achievement" where "person_id" = $1 and "detail" = $2';
    const values = ["valor.privado@eafit.edu.co", "203.0.113.7"];
    const cause = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
    });
    const spy = vi
      .spyOn(badges, "recomputeBadgesFor")
      .mockRejectedValueOnce(new DrizzleQueryError(query, values, cause));
    await drainOutbox();
    // El fallo salió del recálculo de insignias, que es donde la prueba lo puso.
    expect(badges.recomputeBadgesFor).toHaveBeenCalled();
    spy.mockRestore();

    const run = await getReconciliationRun(runId);
    expect(run?.status).toBe("FAILED");
    // El SQL se queda, con sus marcadores: es lo que sirve para saber qué falló.
    expect(run?.error).toContain(query);
    const [audited] = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "reconciliation.failed"), eq(auditLog.entityId, runId)));
    const auditedError = JSON.stringify(audited?.after);
    expect(auditedError).toContain("Failed query");
    for (const value of values) {
      expect(run?.error).not.toContain(value);
      expect(auditedError).not.toContain(value);
    }
  });

  it("un error deja la corrida FAILED y reanudarla la termina", async () => {
    const { wordlero } = await seedUniverse();
    const runId = await startRun("APPLY");

    // Fallo determinístico en el primer recompute del lote: la corrida queda FAILED sin
    // re-lanzar y reanudable desde el cursor.
    const spy = vi
      .spyOn(badges, "recomputeBadgesFor")
      .mockRejectedValueOnce(new Error("fallo sintético"));
    await drainOutbox();
    spy.mockRestore();

    let run = await getReconciliationRun(runId);
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toContain("fallo sintético");

    await runCommand(SYSTEM_ACTOR, (ctx) => resumeReconciliation(ctx, runId));
    await drainOutbox();

    run = await getReconciliationRun(runId);
    expect(run?.status).toBe("DONE");
    expect(run?.error).toBeNull();
    expect(run?.processed).toBe(3);
    expect(run?.unlocked).toBe(2);
    expect(await db().select().from(achievement)).toHaveLength(2);
    // El logro del wordlero quedó histórico aunque se desbloqueó en la reanudación.
    const delWordlero = await db()
      .select()
      .from(achievement)
      .where(eq(achievement.personId, wordlero));
    expect(delWordlero[0]?.historical).toBe(true);
  });
});
