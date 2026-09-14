import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { computePerson, loadPeopleFacts, loadTermFacts } from "@/modules/permanence";
import {
  leaderScore,
  permanenceDecision,
  permanenceRule,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { truncateAll } from "./db";
import {
  seedAppointment,
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembershipTerm,
  seedOccasion,
  seedRule,
  seedTable,
  seedTerm,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "./factories";

// Restricciones del esquema de permanencia (03-modelo) y el cargador de hechos que alimenta el
// cálculo (ADR-036 regla 5).

describe("esquema de permanencia", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("exige una clave por tabla y coherencia entre ámbito y comité", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    await seedRule(termId, "integraciones");
    await expect(seedRule(termId, "integraciones")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "permanence_rule_general_unique"),
    );
    await seedRule(termId, "integraciones", { committeeId });
    await expect(seedRule(termId, "integraciones", { committeeId })).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "permanence_rule_committee_unique"),
    );
    await expect(seedRule(termId, "rara", { scope: "COMMITTEE" })).rejects.toSatisfy((error) =>
      isCheckViolation(error, "permanence_rule_scope_consistent"),
    );
    await expect(seedRule(termId, "MAYUSCULAS")).rejects.toSatisfy((error) =>
      isCheckViolation(error, "permanence_rule_key_format"),
    );
    await expect(seedRule(termId, "negativa", { weight: -1 })).rejects.toSatisfy((error) =>
      isCheckViolation(error, "permanence_rule_weight_nonnegative"),
    );
  });

  it("una tabla por ámbito y comité, y un grupo por código en el término", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    await seedTable(termId, null);
    await expect(seedTable(termId, null)).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "permanence_table_general_unique"),
    );
    await seedTable(termId, committeeId, { lockedAt: new Date() });
    await expect(seedTable(termId, committeeId)).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "permanence_table_committee_unique"),
    );
    await seedWorkGroup(termId, "CAP", { kind: "WORK_COMMITTEE", code: "CAP" });
    await expect(
      seedWorkGroup(termId, "Otro CAP", { kind: "WORK_COMMITTEE", code: "CAP" }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "work_group_code_unique"));
    await expect(seedWorkGroup(termId, "minúsculas", { code: "cap" })).rejects.toSatisfy((error) =>
      isCheckViolation(error, "work_group_code_format"),
    );
  });

  it("una pertenencia por grupo y persona, evaluada solo con fecha, y un puntaje por criterio", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("g@eafit.edu.co");
    const groupId = await seedWorkGroup(termId, "GAP Inventiva");
    await seedWorkGroupMembership(groupId, personId);
    await expect(seedWorkGroupMembership(groupId, personId)).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "work_group_membership_unique"),
    );
    await expect(
      getDb()
        .insert(workGroupMembership)
        .values({ groupId, personId: await seedMember("h@eafit.edu.co"), evaluation: "GOOD" }),
    ).rejects.toSatisfy((error) =>
      isCheckViolation(error, "work_group_membership_evaluated_consistent"),
    );
    const ruleId = await seedRule(termId, "convivencia", { computation: "LEADER_SCORE" });
    await getDb().insert(leaderScore).values({ termId, personId, ruleId, value: 3 });
    await expect(
      getDb().insert(leaderScore).values({ termId, personId, ruleId, value: 4 }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "leader_score_unique"));
    // Un criterio con puntajes no se borra (restrict).
    await expect(
      getDb().delete(permanenceRule).where(eq(permanenceRule.id, ruleId)),
    ).rejects.toThrow();
  });

  it("las decisiones exigen motivo al cambiar y separan la fila de persona de la de comité", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("d@eafit.edu.co");
    const committeeId = await seedCommittee("pixel");
    await getDb().insert(permanenceDecision).values({
      termId,
      personId,
      committeeId,
      proposed: "PROBATION",
      decision: "PROBATION",
    });
    await expect(
      getDb().insert(permanenceDecision).values({
        termId,
        personId,
        committeeId,
        proposed: "PROBATION",
        decision: "PROBATION",
      }),
    ).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "permanence_decision_committee_unique"),
    );
    await expect(
      getDb()
        .insert(permanenceDecision)
        .values({
          termId,
          personId,
          committeeId: await seedCommittee("cigma"),
          proposed: "PROBATION",
          decision: "CONTINUES",
        }),
    ).rejects.toSatisfy((error) =>
      isCheckViolation(error, "permanence_decision_reason_when_changed"),
    );
    await expect(
      getDb().insert(permanenceDecision).values({
        termId,
        personId,
        committeeId: null,
        proposed: "PROBATION",
        decision: "PROBATION",
      }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "permanence_decision_person_scope"));
    await getDb().insert(permanenceDecision).values({
      termId,
      personId,
      committeeId: null,
      proposed: "CONTINUES",
      decision: "EXIT_OE",
      reason: "GH lo decidió",
    });
    await expect(
      getDb().insert(permanenceDecision).values({
        termId,
        personId,
        committeeId: null,
        proposed: "CONTINUES",
        decision: "CONTINUES",
      }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "permanence_decision_person_unique"));
  });
});

describe("cargador de hechos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("arma los hechos del término y de cada persona con su condición, check-ins y grupos", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const veteranId = await seedMember("v@eafit.edu.co");
    const probationId = await seedMember("p@eafit.edu.co");
    const outsiderId = await seedMember("o@eafit.edu.co");
    await seedCommitteeMembership(veteranId, committeeId, termId);
    await seedCommitteeMembership(probationId, committeeId, termId);
    await seedMembershipTerm(probationId, termId, true);
    await seedRule(termId, "integraciones", {
      computation: "CHECKIN_COUNT",
      params: { category: "INTEGRATION", perUnit: 2, expectedCount: 10 },
    });
    await seedRule(termId, "gap", {
      weight: 5,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED" },
    });
    await seedRule(termId, "eventos", { committeeId, weight: 60 });
    const integration = await seedOccasion(termId, {
      category: "INTEGRATION",
      startsAt: new Date(Date.now() - 86_400_000),
      status: "CLOSED",
    });
    await seedCheckIn(integration.id, veteranId);
    await seedCheckIn(integration.id, probationId, "REJECTED");
    await seedAppointment(outsiderId, termId, "GH_DIRECTOR");
    const groupId = await seedWorkGroup(termId, "GAP Días EAFIT", { evaluatorIds: [outsiderId] });
    await seedWorkGroupMembership(groupId, veteranId, "GOOD", outsiderId);

    const facts = await loadTermFacts(termId);
    expect(facts).not.toBeNull();
    if (!facts) throw new Error("sin hechos");
    // El ámbito ordena por el enum (general primero) y después por comité y orden.
    expect(facts.rules.map((rule) => rule.key).sort()).toEqual(["eventos", "gap", "integraciones"]);
    expect(facts.rules[0]?.scope).toBe("GENERAL");
    expect(facts.occasions).toHaveLength(1);
    expect(facts.groups).toEqual([
      {
        id: groupId,
        kind: "GAP",
        code: null,
        name: "GAP Días EAFIT",
        macroeventId: null,
        evaluatorIds: [outsiderId],
      },
    ]);
    expect(facts.config.thresholds).toEqual({ active: 60, new: 80, probation: 80, transfer: 70 });

    const people = await loadPeopleFacts(facts);
    expect(people.map((item) => item.personId).sort()).toEqual([probationId, veteranId].sort());
    const veteran = people.find((item) => item.personId === veteranId);
    const onProbation = people.find((item) => item.personId === probationId);
    // seedMember deja firstTermId en el término actual: son "nuevos" para el cálculo.
    expect(veteran).toMatchObject({ status: "ACTIVE", isNew: true, probation: false });
    expect(veteran?.attended.has(integration.id)).toBe(true);
    expect(veteran?.groupMemberships).toHaveLength(1);
    expect(onProbation).toMatchObject({ probation: true });
    expect(onProbation?.attended.size).toBe(0);
    expect(veteran?.assemblyRequirement.requiredOrdinary).toBe(1);

    const result = computePerson(facts, veteran as NonNullable<typeof veteran>, new Date());
    expect(result.generalTotal).toBe(7); // 2 de integración + 5 del GAP
    expect(result.results[0]).toMatchObject({ committeeId, condition: "NEW", threshold: 80 });

    const single = await loadPeopleFacts(facts, [probationId]);
    expect(single).toHaveLength(1);
    expect(single[0]?.personId).toBe(probationId);
  });
});
