import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { SYSTEM_ACTOR } from "@/db/tx";
import {
  applyTemplateAs,
  commentTableAs,
  copyFromPreviousTermAs,
  createRuleAs,
  deleteRuleAs,
  getTableView,
  listTableViews,
  lockAllCommitteeTablesAs,
  previewImpact,
  ruleInputSchema,
  setTableLockAs,
  updateRuleAs,
} from "@/modules/permanence";
import { leaderScore } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedRule,
  seedTerm,
} from "./factories";

// Reglas por término y tabla (ADR-036 regla 3): claves únicas, bloqueo que el líder no salta,
// copia solo sobre tabla vacía, referencia, borrado restringido, recompute encolado una vez y
// edición acotada a la tabla autorizada (ADR-072).

const admin = { personId: null, ip: null } as typeof SYSTEM_ACTOR;

function manual(key: string, weight = 10) {
  return ruleInputSchema.parse({ key, label: key, weight, computation: "MANUAL", params: {} });
}

async function pendingRecomputes(termId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(outbox)
    .where(
      and(
        eq(outbox.eventType, "permanence.recompute"),
        isNull(outbox.processedAt),
        eq(outbox.dedupeKey, `permanence:${termId}:*`),
      ),
    );
  return row?.n ?? 0;
}

describe("reglas de permanencia", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea, edita y borra criterios con clave única y encola un solo recompute", async () => {
    const termId = await seedTerm();
    const ref = { termId, scope: "GENERAL" as const, committeeId: null };
    const { id } = await createRuleAs(admin, ref, manual("integraciones"), { bypassLock: true });
    await expect(
      createRuleAs(admin, ref, manual("integraciones"), { bypassLock: true }),
    ).rejects.toThrow(t("T-729"));
    await updateRuleAs(admin, ref, id, manual("integraciones", 12), { bypassLock: true });
    const view = await getTableView(ref);
    expect(view.rules.map((rule) => [rule.key, rule.weight])).toEqual([["integraciones", 12]]);
    expect(view.sums).toEqual({ veterans: 12, newcomers: 12 });
    expect(await pendingRecomputes(termId)).toBe(1);
    await deleteRuleAs(admin, ref, id, { bypassLock: true });
    expect((await getTableView(ref)).rules).toEqual([]);
  });

  it("editar o borrar exige que el criterio sea de la tabla recibida, también para ADMIN", async () => {
    const previous = await seedTerm("2024-1");
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const pixel = await seedCommittee("pixel");
    const ref = { termId, scope: "COMMITTEE" as const, committeeId: a3 };
    const generalRef = { termId, scope: "GENERAL" as const, committeeId: null };
    const own = await seedRule(termId, "reuniones", { committeeId: a3, weight: 12 });
    const foreign = await seedRule(termId, "reuniones", { committeeId: pixel, weight: 20 });
    const general = await seedRule(termId, "integraciones", { weight: 10 });
    const old = await seedRule(previous, "reuniones", { committeeId: a3, weight: 30 });
    // Con puntajes, un criterio ajeno tampoco revela que existe: T-032 y no T-732.
    const personId = await seedMember("puntuada@eafit.edu.co");
    await getDb().insert(leaderScore).values({ termId, personId, ruleId: foreign, value: 5 });
    for (const id of [foreign, general, old]) {
      for (const editor of [{ bypassLock: false }, { bypassLock: true }]) {
        await expect(updateRuleAs(admin, ref, id, manual("cambiada", 1), editor)).rejects.toThrow(
          t("T-032"),
        );
        await expect(deleteRuleAs(admin, ref, id, editor)).rejects.toThrow(t("T-032"));
      }
    }
    await expect(
      updateRuleAs(admin, generalRef, own, manual("cambiada", 1), { bypassLock: true }),
    ).rejects.toThrow(t("T-032"));
    expect(await pendingRecomputes(termId)).toBe(0);
    const weights = async (tableRef: Parameters<typeof getTableView>[0]) =>
      (await getTableView(tableRef)).rules.map((rule) => [rule.key, rule.weight]);
    expect(await weights({ termId, scope: "COMMITTEE", committeeId: pixel })).toEqual([
      ["reuniones", 20],
    ]);
    expect(await weights(generalRef)).toEqual([["integraciones", 10]]);
    expect(await weights({ termId: previous, scope: "COMMITTEE", committeeId: a3 })).toEqual([
      ["reuniones", 30],
    ]);
    // El propio sí: se edita, se borra y la auditoría del borrado guarda su tabla.
    await updateRuleAs(admin, ref, own, manual("reuniones", 14), { bypassLock: false });
    expect(await weights(ref)).toEqual([["reuniones", 14]]);
    await deleteRuleAs(admin, ref, own, { bypassLock: false });
    expect(await weights(ref)).toEqual([]);
    const [deleted] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "permanence-rule.deleted"), eq(auditLog.entityId, own)));
    expect(deleted?.before).toEqual({
      termId,
      scope: "COMMITTEE",
      committeeId: a3,
      key: "reuniones",
      weight: 14,
    });
  });

  it("el líder no escribe una tabla bloqueada y ADMIN sí; un criterio con puntajes no se borra", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const ref = { termId, scope: "COMMITTEE" as const, committeeId };
    await setTableLockAs(admin, ref, true);
    await commentTableAs(admin, ref, "Falta el evento 2");
    const locked = await getTableView(ref);
    expect(locked.lockedAt).not.toBeNull();
    expect(locked.comment).toBe("Falta el evento 2");
    await expect(
      createRuleAs(admin, ref, manual("reuniones"), { bypassLock: false }),
    ).rejects.toThrow(t("T-731", { comité: committeeId }));
    const { id } = await createRuleAs(admin, ref, manual("reuniones"), { bypassLock: true });
    await setTableLockAs(admin, ref, false);
    expect((await getTableView(ref)).lockedAt).toBeNull();
    const personId = await seedMember("l@eafit.edu.co");
    await getDb().insert(leaderScore).values({ termId, personId, ruleId: id, value: 5 });
    await expect(deleteRuleAs(admin, ref, id, { bypassLock: false })).rejects.toThrow(t("T-732"));
    expect(
      await lockAllCommitteeTablesAs(admin, termId, [committeeId, await seedCommittee("pixel")]),
    ).toBe(2);
    expect((await listTableViews(termId)).filter((view) => view.lockedAt !== null)).toHaveLength(2);
  });

  it("copia del semestre anterior solo sobre una tabla vacía y carga la referencia una vez", async () => {
    const previous = await seedTerm("2026-1");
    const termId = await seedTerm("2026-2");
    const ref = { termId, scope: "GENERAL" as const, committeeId: null };
    await expect(copyFromPreviousTermAs(admin, ref, { bypassLock: true })).rejects.toThrow(
      t("T-734"),
    );
    await seedRule(previous, "integraciones", { weight: 10 });
    await seedRule(previous, "asambleas", { weight: 10, sortOrder: 1 });
    expect(await copyFromPreviousTermAs(admin, ref, { bypassLock: true })).toBe(2);
    expect((await getTableView(ref)).rules.map((rule) => rule.key)).toEqual([
      "integraciones",
      "asambleas",
    ]);
    await expect(copyFromPreviousTermAs(admin, ref, { bypassLock: true })).rejects.toThrow(
      t("T-733"),
    );
    const committeeId = await seedCommittee("a3");
    const committeeRef = { termId, scope: "COMMITTEE" as const, committeeId };
    expect(await applyTemplateAs(admin, committeeRef, { bypassLock: true })).toBe(3);
    await expect(applyTemplateAs(admin, committeeRef, { bypassLock: true })).rejects.toThrow(
      t("T-733"),
    );
    const generalRef = {
      termId: await seedTerm("2024-2"),
      scope: "GENERAL" as const,
      committeeId: null,
    };
    expect(await applyTemplateAs(admin, generalRef, { bypassLock: true })).toBe(9);
    expect((await getTableView(generalRef)).sums).toEqual({ veterans: 50, newcomers: 45 });
  });

  it("la vista previa del impacto resume los estados del roster con las reglas guardadas", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const attends = await seedMember("a@eafit.edu.co");
    const skips = await seedMember("b@eafit.edu.co");
    // Entraron al comité antes de la reunión de ayer: son elegibles para la tasa (ADR-005).
    const joinedAt = new Date(Date.now() - 7 * 86_400_000);
    await seedCommitteeMembership(attends, committeeId, termId, "MIEMBRO", { joinedAt });
    await seedCommitteeMembership(skips, committeeId, termId, "MIEMBRO", { joinedAt });
    await seedRule(termId, "integraciones", {
      computation: "CHECKIN_COUNT",
      weight: 10,
      params: { category: "INTEGRATION", perUnit: 10, expectedCount: 1 },
    });
    await seedRule(termId, "reuniones", {
      committeeId,
      computation: "CHECKIN_RATE",
      weight: 90,
      params: { category: "COMMITTEE_MEETING", committee: "OWN" },
    });
    const integration = await seedOccasion(termId, {
      category: "INTEGRATION",
      startsAt: new Date(Date.now() - 86_400_000),
      status: "CLOSED",
    });
    const meeting = await seedOccasion(termId, {
      category: "COMMITTEE_MEETING",
      committeeId,
      startsAt: new Date(Date.now() - 86_400_000),
      status: "CLOSED",
      points: 0,
    });
    await seedCheckIn(integration.id, attends);
    await seedCheckIn(meeting.id, attends);
    const preview = await previewImpact(termId, committeeId);
    // Quien asistió lleva 100 y va en camino; quien faltó lleva 0 y, sin más reuniones, no alcanza.
    expect(preview).toEqual({
      committeeId,
      people: 2,
      enCamino: 1,
      enRiesgo: 0,
      noAlcanza: 1,
      average: 50,
    });
    expect(await previewImpact(termId, null)).toMatchObject({ people: 2 });
  });
});
