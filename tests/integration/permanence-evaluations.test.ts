import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { drain } from "@/jobs/poller";
import "@/jobs/handlers";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { listCommitteeAnnouncements, listMemberAnnouncements } from "@/modules/content";
import { announcement } from "@/modules/content/schema";
import { grantRecognitionAs, listInteractions, listRecognitionsByPeople } from "@/modules/crm";
import { onboardingProgress } from "@/modules/crm/schema";
import { consent } from "@/modules/people/schema";
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
import { closeTermPermanence, closeTermPoints } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedRule,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "./factories";

// Evaluaciones, puntajes, créditos y reconocimientos (ADR-026, ADR-028, ADR-036 reglas 6 a 8).

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
    // Hoy (ventana cerrada: el término termina en diciembre) el evaluador no puede; quien no evalúa, tampoco.
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
    await drain(50);
    await drain(50);
    const summaries = await interactionsOf(member);
    expect(summaries).toHaveLength(2);
    expect(summaries[1]).toContain("Desempeño insuficiente en GAP Días");
    expect(summaries[0]).toContain("Buen desempeño en GAP Días");
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
    await drain(50);
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
    const inCommittee = { inCommittee: true, personName: "M", committeeName: "A3" };
    await expect(
      scoreCriterionAs(leader, { ruleId, personId: member, value: 6, note: "" }, inCommittee),
    ).rejects.toThrow(t("T-774", { peso: 5 }));
    await expect(
      scoreCriterionAs(leader, { ruleId, personId: member, value: 3, note: "" }, inCommittee),
    ).rejects.toThrow(t("T-775"));
    await expect(
      scoreCriterionAs(
        leader,
        { ruleId, personId: member, value: 3, note: "Tarde" },
        { ...inCommittee, inCommittee: false },
      ),
    ).rejects.toThrow(t("T-776", { nombre: "M", comité: "A3" }));
    await scoreCriterionAs(
      leader,
      { ruleId, personId: member, value: 3, note: "Llegó tarde" },
      inCommittee,
    );
    await scoreCriterionAs(
      leader,
      { ruleId, personId: member, value: 4, note: "Mejoró" },
      inCommittee,
    );
    const scores = await listLeaderScores(termId, committeeId);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ value: 4, note: "Mejoró" });
    const live = await getPersonPermanence(member, termId);
    expect(live?.result.results[0]?.criteria[0]).toMatchObject({ achieved: 4, remaining: 1 });
    await drain(50);
    expect((await interactionsOf(member))[0]).toBe("convivencia en A3: 4 de 5: Mejoró");
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
    await getDb().insert(consent).values({
      personId: withConsent,
      purpose: "DIRECTORY_PHOTO",
      source: "SELF",
      policyVersion: "prueba-v1",
    });
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
    expect(board[0]?.title).toBe("Destacado de agosto: Persona Sintética");
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
    expect(byPerson.get(withConsent)?.[0]?.announcementId).not.toBeNull();
    expect(byPerson.get(without)?.[0]?.announcementId).toBeNull();
    expect((await interactionsOf(withConsent))[0]).toBe("Destacado de agosto en A3");
    const [rows] = await getDb().select({ n: count() }).from(announcement);
    expect(rows?.n).toBe(1);
  });
});
