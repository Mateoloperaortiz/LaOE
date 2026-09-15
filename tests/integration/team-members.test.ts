import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { event } from "@/modules/events/schema";
import { getGroupDetail, removeMember } from "@/modules/permanence/domain/groups";
import { prepareMacroeventGroup } from "@/modules/permanence/domain/macroevents";
import {
  listTeamParticipations,
  saveMacroeventMemberAs,
} from "@/modules/permanence/domain/team-members";
import { workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

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
});
