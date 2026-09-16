import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { event } from "@/modules/events/schema";
import { getSnapshot, recomputeSnapshots } from "@/modules/permanence";
import { getGroupDetail, removeMember } from "@/modules/permanence/domain/groups";
import { prepareMacroeventGroup } from "@/modules/permanence/domain/macroevents";
import {
  listTeamParticipations,
  saveMacroeventMemberAs,
} from "@/modules/permanence/domain/team-members";
import { permanenceRule, workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedRule,
  seedTerm,
} from "./factories";

async function setup() {
  const termId = await seedTerm();
  const personId = await seedMember("equipo@example.com");
  const evaluatorId = await seedMember("gh@example.com");
  const [macro] = await getDb()
    .insert(event)
    .values({ name: "Inventiva", slug: "inventiva" })
    .returning();
  if (!macro) throw new Error("Falta evento sintético");
  const gt = await runCommand(SYSTEM_ACTOR, (ctx) => prepareMacroeventGroup(ctx, macro.id, termId));
  const gap = await runCommand(SYSTEM_ACTOR, (ctx) =>
    prepareMacroeventGroup(ctx, macro.id, termId, "GAP"),
  );
  return {
    termId,
    personId,
    actor: { personId: evaluatorId },
    gt: gt.id,
    gap: gap.id,
    eventId: macro.id,
  };
}
const admin = { isAdmin: true };

describe("áreas y acreditación de GT/GAP", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  it("conserva grupos canónicos separados y varias áreas en una única pertenencia pendiente", async () => {
    const s = await setup();
    const again = await runCommand(SYSTEM_ACTOR, (ctx) =>
      prepareMacroeventGroup(ctx, s.eventId, s.termId, "GAP"),
    );
    expect(again.id).toBe(s.gap);
    expect(await getDb().select().from(workGroup)).toHaveLength(2);
    await saveMacroeventMemberAs(
      s.actor,
      s.gt,
      { personId: s.personId, areas: ["PUBLICIDAD", "GESTION_HUMANA", "PUBLICIDAD"] },
      admin,
    );
    const rows = await getDb().select().from(workGroupMembership);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      areas: ["PUBLICIDAD", "GESTION_HUMANA"],
      evaluation: "PENDING",
      evaluatedAt: null,
    });
    const views = await listTeamParticipations([s.personId], s.termId);
    expect(views.get(s.personId)?.map((row) => row.label)).toEqual([
      "GT · Publicidad · Inventiva",
      "GT · Gestión Humana · Inventiva",
    ]);
    expect(await listTeamParticipations([s.personId], await seedTerm("2025-2"))).toEqual(new Map());
  });
  it("acredita con auditoría y recomputación; editar áreas conserva la evaluación", async () => {
    const s = await setup();
    await saveMacroeventMemberAs(
      s.actor,
      s.gap,
      { personId: s.personId, areas: ["LOGISTICA"], credit: true },
      admin,
    );
    const before = (await getGroupDetail(s.gap))?.members[0];
    expect(before).toMatchObject({ evaluation: "GOOD", evaluatedById: s.actor.personId });
    await saveMacroeventMemberAs(
      s.actor,
      s.gap,
      { personId: s.personId, areas: ["PUBLICIDAD"] },
      admin,
    );
    const after = (await getGroupDetail(s.gap))?.members[0];
    expect(after?.evaluatedAt).toEqual(before?.evaluatedAt);
    expect(after?.evaluation).toBe("GOOD");
    expect(
      await getDb().select().from(auditLog).where(eq(auditLog.action, "work-group.evaluated")),
    ).toHaveLength(1);
    expect(
      await getDb().select().from(outbox).where(eq(outbox.eventType, "evaluation.recorded")),
    ).toHaveLength(1);
    expect(
      await getDb().select().from(outbox).where(eq(outbox.eventType, "permanence.recompute")),
    ).toHaveLength(1);
  });
  it("rechaza áreas de otro macroevento, permisos insuficientes y término cerrado sin dejar altas parciales", async () => {
    const s = await setup();
    await expect(
      saveMacroeventMemberAs(
        s.actor,
        s.gt,
        { personId: s.personId, areas: ["CARNIVAL"], credit: true },
        admin,
      ),
    ).rejects.toThrow();
    await expect(
      saveMacroeventMemberAs(
        s.actor,
        s.gt,
        { personId: s.personId, areas: ["PUBLICIDAD"], credit: true },
        { isAdmin: false },
      ),
    ).rejects.toThrow();
    await getDb().update(term).set({ permanenceClosedAt: new Date() }).where(eq(term.id, s.termId));
    await expect(
      saveMacroeventMemberAs(
        s.actor,
        s.gt,
        { personId: s.personId, areas: ["PUBLICIDAD"], credit: true },
        admin,
      ),
    ).rejects.toThrow();
    expect(await getDb().select().from(workGroupMembership)).toHaveLength(0);
    expect(await getDb().select().from(outbox)).toHaveLength(0);
  });
  it("oculta la participación retirada y reincorpora pendiente sin reutilizar el cumplimiento anterior", async () => {
    const s = await setup();
    await saveMacroeventMemberAs(
      s.actor,
      s.gt,
      { personId: s.personId, areas: ["PUBLICIDAD"], credit: true },
      admin,
    );
    await runCommand(s.actor, (ctx) => removeMember(ctx, s.gt, s.personId));
    expect(await listTeamParticipations([s.personId], s.termId)).toEqual(new Map());
    await saveMacroeventMemberAs(
      s.actor,
      s.gt,
      { personId: s.personId, areas: ["GESTION_HUMANA"] },
      admin,
    );
    expect((await getGroupDetail(s.gt))?.members[0]).toMatchObject({
      evaluation: "PENDING",
      leftAt: null,
      evaluatedAt: null,
      evaluatedById: null,
      areas: ["GESTION_HUMANA"],
    });
  });

  it("acreditar el GT deja el criterio GAP en su peso completo (ADR-071)", async () => {
    const { termId, personId, actor, gt } = await setup();
    // La tabla de permanencia se arma sobre el roster del término: comité y criterio GAP.
    await seedCommitteeMembership(personId, await seedCommittee("a3"), termId);
    await seedRule(termId, "gap", {
      label: "GAP",
      weight: 5,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED", alsoCounts: ["GT_MACROEVENT"] },
    });
    // Sin participación acreditada el criterio está en cero.
    await recomputeSnapshots(termId);
    const antes = await getSnapshot(personId, termId);
    expect(antes?.general.find((item) => item.key === "gap")).toMatchObject({ achieved: 0 });

    await saveMacroeventMemberAs(
      actor,
      gt,
      { personId, areas: ["LOGISTICA"], credit: true },
      admin,
    );
    await recomputeSnapshots(termId);
    const despues = await getSnapshot(personId, termId);
    const criterio = despues?.general.find((item) => item.key === "gap");
    expect(criterio).toMatchObject({ achieved: 5, remaining: 0 });
    // El desglose explica que cuenta por el GT, sin pertenencia GAP.
    expect(criterio?.detail).toMatchObject({
      type: "GROUP_EVALUATED",
      goodCount: 1,
      groups: [{ groupId: gt, equivalentKind: "GT_MACROEVENT" }],
    });
  });

  it("la migración 0033 activa la equivalencia solo en semestres abiertos y respeta lo que GH ya fijó", async () => {
    const abierto = await seedTerm();
    const cerrado = await seedTerm("2026-1");
    await getDb()
      .update(term)
      .set({ permanenceClosedAt: new Date("2026-06-20T00:00:00Z") })
      .where(eq(term.id, cerrado));
    const gap = { computation: "GROUP_EVALUATED" as const, weight: 5 };
    const abiertoGap = await seedRule(abierto, "gap", {
      ...gap,
      params: { groupKind: "GAP", mode: "FIXED" },
    });
    // GH ya quitó la equivalencia en esta fila: la migración no la vuelve a poner.
    const abiertoSinGt = await seedRule(abierto, "gap-sin-gt", {
      ...gap,
      params: { groupKind: "GAP", mode: "FIXED", alsoCounts: [] },
    });
    const abiertoOe = await seedRule(abierto, "gap-oe", {
      ...gap,
      params: { groupKind: "GAP_OE", mode: "PER_GROUP", perGroup: 3 },
    });
    const cerradoGap = await seedRule(cerrado, "gap", {
      ...gap,
      params: { groupKind: "GAP", mode: "FIXED" },
    });

    const migration = await readFile(
      new URL("../../drizzle/0033_gt_cumple_gap.sql", import.meta.url),
      "utf8",
    );
    await getDb().transaction(async (tx) => {
      for (const statement of migration.split("--> statement-breakpoint"))
        await tx.execute(sql.raw(statement));
    });

    const params = async (id: string) =>
      (await getDb().select().from(permanenceRule).where(eq(permanenceRule.id, id)))[0]?.params;
    expect(await params(abiertoGap)).toMatchObject({ alsoCounts: ["GT_MACROEVENT"] });
    expect(await params(abiertoSinGt)).toMatchObject({ alsoCounts: [] });
    expect(await params(abiertoOe)).not.toHaveProperty("alsoCounts");
    expect(await params(cerradoGap)).not.toHaveProperty("alsoCounts");
    const recalculos = (await getDb().select().from(outbox)).filter(
      (row) => row.eventType === "permanence.recompute",
    );
    expect(recalculos.map((row) => row.payload)).toEqual([{ termId: abierto }]);
  });
});
