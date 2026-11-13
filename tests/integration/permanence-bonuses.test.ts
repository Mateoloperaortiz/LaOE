import { sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { cancelOccasionCheckIns } from "@/modules/participation/domain/check-ins";
import { loadGamificationSettings } from "@/modules/participation/domain/member-context";
import { cancelOccasion } from "@/modules/participation/domain/occasions";
import { changeMembershipStatus } from "@/modules/people/domain/membership";
import {
  closeTermPermanenceAs,
  collectOwnPermanenceData,
  confirmAllProposedAs,
  getPersonPermanence,
  getSnapshot,
  grantPermanenceBonusAs,
  previewPermanenceBonus,
} from "@/modules/permanence";
import { closeTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import {
  leaveUntilSoon,
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedOccasion,
  seedRule,
  seedTerm,
  seedVeteran,
} from "../factories";
import { heldThenSettled, holdCommand, outcome } from "../helpers/locks";
import { truncateAll } from "./db";

beforeEach(truncateAll);
afterAll(closeDb);

async function roster() {
  const termId = await seedTerm();
  const personId = await seedVeteran("miembro-bono@eafit.edu.co");
  const actor = { personId: await seedVeteran("gh-bono@eafit.edu.co"), ip: null };
  const committeeId = await seedCommittee("a3");
  await seedCommitteeMembership(personId, committeeId, termId, "MIEMBRO", { joinedAt: null });
  const barra = await seedRule(termId, "barra-brava", {
    weight: 7,
    computation: "CHECKIN_THRESHOLD",
    params: { category: "ATHLETIC_MATCH", minCount: 3 },
  });
  const macro = await seedRule(termId, "gt-macroeventos", {
    weight: 3,
    computation: "GROUP_EVALUATED",
    params: { groupKind: "GT_MACROEVENT", mode: "FIXED" },
  });
  const input = {
    termId,
    personId,
    ruleIds: [barra, macro],
    total: 10,
    reason: "Ayudó a decorar la oficina",
    requestId: crypto.randomUUID(),
  };
  return { termId, personId, actor, barra, macro, committeeId, input };
}

it("reparte un bono de diez puntos entre dos criterios y muestra el motivo en cada uno", async () => {
  const { termId, personId, actor, barra, macro, input } = await roster();
  const { reason } = input;
  expect(await previewPermanenceBonus(termId, personId)).toEqual([
    {
      committeeId: null,
      criteria: expect.arrayContaining([
        { ruleId: barra, label: "barra-brava", missing: 700 },
        { ruleId: macro, label: "gt-macroeventos", missing: 300 },
      ]),
    },
  ]);
  await grantPermanenceBonusAs(actor, input);

  const view = await getPersonPermanence(personId, termId);
  expect(view?.result.generalTotal).toBe(10);
  expect(view?.result.general).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: barra,
        achieved: 7,
        detail: expect.objectContaining({ attended: 0 }),
        bonusBreakdown: {
          baseAchieved: 0,
          grants: [expect.objectContaining({ value: 7, applied: 7, reason })],
        },
      }),
      expect.objectContaining({
        ruleId: macro,
        achieved: 3,
        detail: expect.objectContaining({ goodCount: 0 }),
        bonusBreakdown: {
          baseAchieved: 0,
          grants: [expect.objectContaining({ value: 3, applied: 3, reason })],
        },
      }),
    ]),
  );
  expect((await getSnapshot(personId, termId))?.general).toEqual(view?.result.general);
});

it("rechaza un total menor o mayor sin asignar puntos a ningún criterio", async () => {
  const { termId, personId, actor, input } = await roster();
  for (const total of [5, 12]) {
    await expect(grantPermanenceBonusAs(actor, { ...input, total })).rejects.toThrow(
      t("T-4865", { n: 10 }),
    );
  }
  expect((await getPersonPermanence(personId, termId))?.result.generalTotal).toBe(0);
  expect((await collectOwnPermanenceData(personId)).data.permanenceBonuses).toHaveLength(0);
});

it("acepta un reintento idéntico y rechaza otro bono para los mismos faltantes", async () => {
  const { termId, personId, actor, input } = await roster();
  const results = await Promise.allSettled([
    grantPermanenceBonusAs(actor, input),
    grantPermanenceBonusAs(actor, input),
  ]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
  await expect(
    grantPermanenceBonusAs(actor, { ...input, requestId: crypto.randomUUID() }),
  ).rejects.toThrow(t("T-4866"));
  expect((await getPersonPermanence(personId, termId))?.result.generalTotal).toBe(10);
  expect((await collectOwnPermanenceData(personId)).data.permanenceBonuses).toHaveLength(1);
});

it("recalcula el faltante del criterio cuando la persona gana puntos por asistencia", async () => {
  const { termId, personId, actor, input, committeeId, macro } = await roster();
  const ruleId = await seedRule(termId, "reuniones", {
    committeeId,
    weight: 4.05,
    computation: "CHECKIN_COUNT",
    params: { category: "COMMITTEE_MEETING", committee: "OWN", perUnit: 1.25 },
  });
  const meeting = () =>
    seedOccasion(termId, {
      category: "COMMITTEE_MEETING",
      committeeId,
      status: "CLOSED",
      startsAt: new Date(Date.now() - 86_400_000),
    });
  await seedCheckIn((await meeting()).id, personId);
  const grant = { ...input, ruleIds: [ruleId, macro], total: 7.05 };
  await expect(grantPermanenceBonusAs(actor, grant)).rejects.toThrow(t("T-4865", { n: "5,8" }));
  await grantPermanenceBonusAs(actor, { ...grant, total: 5.8 });
  await seedCheckIn((await meeting()).id, personId);

  const [result] = (await getPersonPermanence(personId, termId))?.result.results ?? [];
  expect(result).toMatchObject({
    committeeTotal: 4.05,
    total: 7.05,
    criteria: [
      expect.objectContaining({
        achieved: 4.05,
        detail: expect.objectContaining({ attended: 2 }),
        bonusBreakdown: {
          baseAchieved: 2.5,
          grants: [expect.objectContaining({ value: 2.8, applied: 1.55 })],
        },
      }),
    ],
  });
});

it("congela el bono y su motivo en el cierre y rechaza nuevas asignaciones", async () => {
  const { termId, personId, actor, input } = await roster();
  await grantPermanenceBonusAs(actor, input);
  await runCommand(actor, (ctx) => closeTermPoints(ctx, termId));
  await confirmAllProposedAs(actor, termId);
  await closeTermPermanenceAs(actor, termId);
  const view = await getPersonPermanence(personId, termId);
  expect(view?.live).toBe(false);
  expect(view?.result.generalTotal).toBe(10);
  expect(view?.result.general[0]?.bonusBreakdown?.grants[0]?.reason).toBe(input.reason);
  await expect(
    grantPermanenceBonusAs(actor, { ...input, requestId: crypto.randomUUID() }),
  ).rejects.toThrow(t("T-834"));
});

it("una reunión cancelada en paralelo no crea un faltante ficticio", async () => {
  const { termId, personId, actor, committeeId, input } = await roster();
  const ruleId = await seedRule(termId, "asistencia-reuniones", {
    committeeId,
    computation: "CHECKIN_RATE",
    weight: 10,
    params: { category: "COMMITTEE_MEETING", committee: "OWN" },
  });
  const meetings = await Promise.all(
    [1, 2].map((days) =>
      seedOccasion(termId, {
        committeeId,
        category: "COMMITTEE_MEETING",
        startsAt: new Date(Date.now() - days * 86_400_000),
        status: "CLOSED",
        points: 0,
      }),
    ),
  );
  for (const meeting of meetings) await seedCheckIn(meeting.id, personId);
  const [cancelled] = meetings;
  if (!cancelled) throw new Error("sin reunión");
  const settings = await loadGamificationSettings();
  const held = await holdCommand(actor, async (ctx) => {
    const reason = "Reunión cancelada";
    const previous = await cancelOccasion(ctx, cancelled.id, reason);
    await cancelOccasionCheckIns(ctx, previous, reason, { settings });
    // Deja avanzar la lectura de las ocasiones hasta que la lectura de las asistencias espere.
    await ctx.tx.execute(sql`lock table check_in in access exclusive mode`);
  });
  const { during, after } = await heldThenSettled(held, () =>
    grantPermanenceBonusAs(actor, { ...input, ruleIds: [ruleId], total: 5 }),
  );
  expect(during).toBe("hizo cola");
  expect(outcome(after)).toBe(t("T-4866"));
  expect((await collectOwnPermanenceData(personId)).data.permanenceBonuses).toHaveLength(0);
});

it("rechaza el bono si la persona pasa a licencia mientras GH lo guarda", async () => {
  const { personId, actor, input } = await roster();
  const held = await holdCommand(actor, (ctx) =>
    changeMembershipStatus(ctx, personId, {
      to: "ON_LEAVE",
      leaveUntil: leaveUntilSoon(),
      reason: "Licencia de prueba",
    }),
  );
  const { during, after } = await heldThenSettled(held, () => grantPermanenceBonusAs(actor, input));
  expect(during).toBe("hizo cola");
  expect(outcome(after)).toBe(t("T-4863"));
  expect((await collectOwnPermanenceData(personId)).data.permanenceBonuses).toHaveLength(0);
});
