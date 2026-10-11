import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { listCommitteeAnnouncements, listMemberAnnouncements } from "@/modules/content";
import { announcement } from "@/modules/content/schema";
import { grantRecognitionAs, listInteractions, listRecognitionsByPeople } from "@/modules/crm";
import { onboardingProgress } from "@/modules/crm/schema";
import {
  countPendingFor,
  evaluateAs,
  getPersonPermanence,
  grantManualCreditAs,
  listEvaluationTray,
  listLeaderScores,
  listManualCredits,
  scoreCriterionAs,
} from "@/modules/permanence";
import { leaderScore } from "@/modules/permanence/schema";
import { auditLog } from "@/modules/system/schema";
import { closeTermPermanence, closeTermPoints } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedConsent,
  seedMember,
  seedRule,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Evaluaciones, puntajes, créditos y reconocimientos (ADR-026, ADR-028, ADR-036 reglas 6 a 8).

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

async function interactionsOf(personId: string) {
  return (await listInteractions(personId, "PERMANENCE")).map((item) => item.summary);
}

describe("evaluaciones", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el evaluador solo dentro de la ventana, ADMIN siempre; insuficiente exige nota; una interacción", async () => {
    const termId = await seedTerm();
    const member = await seedMember("m@eafit.edu.co");
    const evaluator = await seedMember("e@eafit.edu.co");
    const other = await seedMember("o@eafit.edu.co");
    const groupId = await seedWorkGroup(termId, "GAP Días", { evaluatorIds: [evaluator] });
    await seedWorkGroupMembership(groupId, member);
    const evaluatorActor = { personId: evaluator, ip: null };
    // La precondición sigue cerrada aunque la suite corra al final del semestre.
    await getDb()
      .update(term)
      .set({ endsOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) })
      .where(eq(term.id, termId));
    await expect(
      evaluateAs(
        evaluatorActor,
        { groupId, personId: member, evaluation: "GOOD", note: "" },
        { isAdmin: false },
      ),
    ).rejects.toThrow(t("T-767"));
    await expect(
      evaluateAs(
        { personId: other, ip: null },
        { groupId, personId: member, evaluation: "GOOD", note: "" },
        { isAdmin: false },
      ),
    ).rejects.toThrow(t("T-768"));
    expect(await countPendingFor(evaluator, termId)).toBe(1);
    // Abrimos la ventana acercando el fin del término.
    await getDb()
      .update(term)
      .set({ endsOn: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) })
      .where(eq(term.id, termId));
    await expect(
      evaluateAs(
        evaluatorActor,
        { groupId, personId: member, evaluation: "INSUFFICIENT", note: "" },
        { isAdmin: false },
      ),
    ).rejects.toThrow(t("T-766"));
    await evaluateAs(
      evaluatorActor,
      { groupId, personId: member, evaluation: "INSUFFICIENT", note: "Faltó" },
      { isAdmin: false },
    );
    await evaluateAs(
      { personId: null, ip: null },
      { groupId, personId: member, evaluation: "GOOD", note: "" },
      { isAdmin: true },
    );
    expect(await countPendingFor(evaluator, termId)).toBe(0);
    const [tray] = await listEvaluationTray(termId, [groupId]);
    expect(tray?.members[0]).toMatchObject({ personId: member, evaluation: "GOOD", note: null });
    await drainOutbox();
    const summaries = await interactionsOf(member);
    expect(summaries).toHaveLength(2);
    expect(summaries[1]).toMatch(
      itemPattern(fillCopy(tList("T-832")[1], { grupo: "GAP Días", nota: "Faltó" })),
    );
    expect(summaries[0]).toMatch(itemPattern(fillCopy(tList("T-832")[0], { grupo: "GAP Días" })));
  });

  it("una tarea de nuevos con buen desempeño marca el paso de decoración del onboarding", async () => {
    const termId = await seedTerm();
    const newcomer = await seedMember("n@eafit.edu.co");
    const groupId = await seedWorkGroup(termId, "Decoración", { kind: "NEW_MEMBER_TASK" });
    await seedWorkGroupMembership(groupId, newcomer);
    await evaluateAs(
      { personId: null, ip: null },
      { groupId, personId: newcomer, evaluation: "GOOD", note: "" },
      { isAdmin: true },
    );
    await drainOutbox();
    const [row] = await getDb()
      .select({ n: count() })
      .from(onboardingProgress)
      .where(
        and(
          eq(onboardingProgress.personId, newcomer),
          eq(onboardingProgress.stepKey, "decoracion"),
        ),
      );
    expect(row?.n).toBe(1);
    // La marcó un trabajo del poller, que no tiene request: a nombre de la persona y sin IP (ADR-123
    // regla 3).
    expect(
      await getDb()
        .select({ actorId: auditLog.actorId, ip: auditLog.ip })
        .from(auditLog)
        .where(eq(auditLog.action, "onboarding.step-done")),
    ).toEqual([{ actorId: newcomer, ip: null }]);
  });
});

describe("puntajes del líder y créditos manuales", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("acota al peso, exige observación al bajar y solo puntúa a quien está en el comité", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const member = await seedMember("m@eafit.edu.co");
    await seedCommitteeMembership(member, committeeId, termId);
    const ruleId = await seedRule(termId, "convivencia", {
      committeeId,
      computation: "LEADER_SCORE",
      weight: 5,
      params: { mandatory: true },
    });
    const leader = { personId: null, ip: null };
    const ref = { termId, scope: "COMMITTEE" as const, committeeId };
    const names = { personName: "M", committeeName: "A3" };
    await expect(
      scoreCriterionAs(leader, ref, { ruleId, personId: member, value: 6, note: "" }, names),
    ).rejects.toThrow(t("T-774", { peso: 5 }));
    await expect(
      scoreCriterionAs(leader, ref, { ruleId, personId: member, value: 3, note: "" }, names),
    ).rejects.toThrow(t("T-775"));
    // Quien no está en el comité: el comando lo lee él, nadie se lo declara (ADR-122 regla 2).
    const outsider = await seedMember("fuera@eafit.edu.co");
    await expect(
      scoreCriterionAs(leader, ref, { ruleId, personId: outsider, value: 3, note: "Tarde" }, names),
    ).rejects.toThrow(t("T-776", { nombre: "M", comité: "A3" }));
    await scoreCriterionAs(
      leader,
      ref,
      { ruleId, personId: member, value: 3, note: "Llegó tarde" },
      names,
    );
    await scoreCriterionAs(
      leader,
      ref,
      { ruleId, personId: member, value: 4, note: "Mejoró" },
      names,
    );
    const scores = await listLeaderScores(termId, committeeId);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ value: 4, note: "Mejoró" });
    const live = await getPersonPermanence(member, termId);
    expect(live?.result.results[0]?.criteria[0]).toMatchObject({ achieved: 4, remaining: 1 });
    await drainOutbox();
    expect((await interactionsOf(member))[0]).toBe(
      `${fillCopy(tList("T-832")[2], { criterio: "convivencia", comité: "A3", valor: 4, peso: 5 })}: Mejoró`,
    );
  });

  it("el líder solo puntúa criterios LEADER_SCORE de la tabla de su comité en el término", async () => {
    const previous = await seedTerm("2024-1");
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const pixel = await seedCommittee("pixel");
    // La persona está en los dos comités: el roster no la frena y la guarda debe ser la tabla.
    const member = await seedMember("m@eafit.edu.co");
    await seedCommitteeMembership(member, a3, termId);
    await seedCommitteeMembership(member, pixel, termId);
    const scored = { computation: "LEADER_SCORE" as const, weight: 5, params: { mandatory: true } };
    const foreign = await seedRule(termId, "convivencia", { committeeId: pixel, ...scored });
    const general = await seedRule(termId, "actitud", scored);
    const old = await seedRule(previous, "convivencia", { committeeId: a3, ...scored });
    const leader = { personId: null, ip: null };
    const ref = { termId, scope: "COMMITTEE" as const, committeeId: a3 };
    const names = { personName: "M", committeeName: "A3" };
    for (const ruleId of [foreign, general, old]) {
      await expect(
        scoreCriterionAs(leader, ref, { ruleId, personId: member, value: 5, note: "" }, names),
      ).rejects.toThrow(t("T-777"));
    }
    expect(await listLeaderScores(termId, pixel)).toEqual([]);
    expect(await getDb().select().from(leaderScore)).toEqual([]);
  });

  it("el crédito manual solo va en criterios manuales, con motivo, y se refleja en la permanencia", async () => {
    const termId = await seedTerm();
    const member = await seedMember("m@eafit.edu.co");
    await seedCommitteeMembership(member, await seedCommittee("a3"), termId);
    const manual = await seedRule(termId, "extra", { weight: 6 });
    const count = await seedRule(termId, "integraciones", {
      computation: "CHECKIN_COUNT",
      params: { category: "INTEGRATION", perUnit: 2 },
    });
    const admin = { personId: null, ip: null };
    await expect(
      grantManualCreditAs(admin, { ruleId: count, personId: member, value: 2, reason: "Apoyo" }),
    ).rejects.toThrow(t("T-787"));
    await expect(
      grantManualCreditAs(admin, { ruleId: manual, personId: member, value: 7, reason: "Apoyo" }),
    ).rejects.toThrow(t("T-774", { peso: 6 }));
    await grantManualCreditAs(admin, {
      ruleId: manual,
      personId: member,
      value: 4,
      reason: "Apoyo",
    });
    expect(await listManualCredits(termId, member)).toMatchObject([
      { label: "extra", value: 4, reason: "Apoyo" },
    ]);
    const live = await getPersonPermanence(member, termId);
    expect(live?.result.general.find((item) => item.key === "extra")).toMatchObject({
      achieved: 4,
      remaining: 2,
    });
    await runCommand(SYSTEM_ACTOR, async (ctx) => {
      await closeTermPoints(ctx, termId);
      await closeTermPermanence(ctx, termId);
    });
    await expect(
      grantManualCreditAs(admin, { ruleId: manual, personId: member, value: 5, reason: "Tarde" }),
    ).rejects.toThrow(t("T-834"));
  });
});

describe("reconocimientos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("publica el anuncio del comité solo con consentimiento de directorio y es único por mes", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const withConsent = await seedMember("c@eafit.edu.co");
    const without = await seedMember("s@eafit.edu.co");
    // El destacado de un comité es de alguien de su roster (ADR-122 regla 2).
    await seedCommitteeMembership(withConsent, committeeId, termId);
    await seedCommitteeMembership(without, committeeId, termId);
    await seedConsent(withConsent, "DIRECTORY_PHOTO");
    const leader = { personId: null, ip: null };
    const published = await grantRecognitionAs(leader, {
      personId: withConsent,
      kind: "MEMBER_OF_MONTH",
      committeeId,
      termId,
      month: 8,
      title: "",
    });
    expect(published.published).toBe(true);
    const board = await listCommitteeAnnouncements(committeeId);
    expect(board).toHaveLength(1);
    expect(board[0]?.title).toBe(t("T-783", { mes: "agosto", nombre: "Persona Sintética" }));
    expect(await listMemberAnnouncements(12)).toHaveLength(0);
    const registered = await grantRecognitionAs(leader, {
      personId: without,
      kind: "MEMBER_OF_MONTH",
      committeeId,
      termId,
      month: 9,
      title: "",
    });
    expect(registered.published).toBe(false);
    await expect(
      grantRecognitionAs(leader, {
        personId: without,
        kind: "MEMBER_OF_MONTH",
        committeeId,
        termId,
        month: 8,
        title: "",
      }),
    ).rejects.toThrow(t("T-780", { comité: "A3", mes: "agosto" }));
    const byPerson = await listRecognitionsByPeople([withConsent, without], termId);
    expect(byPerson.get(withConsent)?.[0]?.announcementId).toEqual(expect.any(String));
    expect(byPerson.get(without)?.[0]?.announcementId).toBeNull();
    expect((await interactionsOf(withConsent))[0]).toBe(
      t("T-833", { mes: "agosto", comité: "A3" }),
    );
    const [rows] = await getDb().select({ n: count() }).from(announcement);
    expect(rows?.n).toBe(1);
  });
});
