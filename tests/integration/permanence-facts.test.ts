import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { adjustRequirementAs } from "@/modules/participation";
import { changeMembershipStatusAs, endMembershipAs, setProbationAs } from "@/modules/people";
import {
  computePerson,
  getPersonPermanence,
  loadPeopleFacts,
  loadTermFacts,
  recomputeSnapshots,
} from "@/modules/permanence";
import {
  leaderScore,
  permanenceDecision,
  permanenceRule,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { type CountedQuery, countQueries } from "../helpers/queries";
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
  seedVeteran,
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

// Caracterización (DT-022): lo que el cargador decide de cada persona antes de que el cálculo la vea.
// Nuevo es quien ingresó en este término o retomó como nuevo, salvo que se reporte como activo
// (Est. art. 5 par. 1); el estado y la prueba son de la persona, no del comité.
describe("cargador de hechos: quién llega como nuevo, y con qué estado y prueba", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  async function arrange() {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const actor = { personId: await seedVeteran("gh@eafit.edu.co"), ip: null };
    return { termId, committeeId, actor };
  }

  async function standing(termId: string, personId: string) {
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("sin hechos");
    const [person] = await loadPeopleFacts(facts, [personId]);
    if (!person) throw new Error("la persona no está en el roster");
    return { status: person.status, isNew: person.isNew, probation: person.probation };
  }

  it("quien ingresó en este término llega como nuevo, activo y sin prueba", async () => {
    const { termId, committeeId } = await arrange();
    const personId = await seedMember("nueva@eafit.edu.co");
    await seedCommitteeMembership(personId, committeeId, termId);
    expect(await standing(termId, personId)).toEqual({
      status: "ACTIVE",
      isNew: true,
      probation: false,
    });
  });

  it("quien ingresó en un término anterior no llega como nuevo", async () => {
    const { termId, committeeId } = await arrange();
    const personId = await seedVeteran("veterana@eafit.edu.co");
    await seedCommitteeMembership(personId, committeeId, termId);
    expect(await standing(termId, personId)).toEqual({
      status: "ACTIVE",
      isNew: false,
      probation: false,
    });
  });

  it("quien retoma como nuevo llega como nuevo aunque haya ingresado en un término anterior", async () => {
    const { termId, committeeId, actor } = await arrange();
    const personId = await seedVeteran("retoma@eafit.edu.co");
    await seedCommitteeMembership(personId, committeeId, termId);
    await setProbationAs(actor, personId, termId, {
      probation: false,
      reason: "Retoma el semestre que dejó a medias",
      resumedNew: true,
    });
    expect(await standing(termId, personId)).toMatchObject({ isNew: true, probation: false });
  });

  it("quien se reporta como activo no llega como nuevo, ni por ingresar en este término ni por retomar como nuevo", async () => {
    const { termId, committeeId, actor } = await arrange();
    const entered = await seedMember("mesa-nueva@eafit.edu.co");
    const resumed = await seedVeteran("mesa-retoma@eafit.edu.co");
    for (const personId of [entered, resumed]) {
      await seedCommitteeMembership(personId, committeeId, termId);
    }
    await setProbationAs(actor, entered, termId, {
      probation: false,
      reason: "Mesa del comité reactivado",
      reportAsVeteran: true,
    });
    await setProbationAs(actor, resumed, termId, {
      probation: false,
      reason: "Mesa del comité reactivado",
      reportAsVeteran: true,
      resumedNew: true,
    });
    expect(await standing(termId, entered)).toMatchObject({ isNew: false });
    expect(await standing(termId, resumed)).toMatchObject({ isNew: false });
  });

  it("la prueba de la persona es la de todos sus comités: la de un solo comité no la marca", async () => {
    const { termId, committeeId, actor } = await arrange();
    const other = await seedCommittee("b4");
    const general = await seedVeteran("prueba-general@eafit.edu.co");
    const scoped = await seedVeteran("prueba-comite@eafit.edu.co");
    for (const personId of [general, scoped]) {
      await seedCommitteeMembership(personId, committeeId, termId);
      await seedCommitteeMembership(personId, other, termId);
    }
    await setProbationAs(actor, general, termId, { probation: true, reason: "Cerró por debajo" });
    await setProbationAs(actor, scoped, termId, {
      probation: true,
      reason: "Cerró por debajo en un comité",
      committeeId: other,
    });
    expect(await standing(termId, general)).toMatchObject({ isNew: false, probation: true });
    expect(await standing(termId, scoped)).toMatchObject({ isNew: false, probation: false });
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("sin hechos");
    const [person] = await loadPeopleFacts(facts, [scoped]);
    expect(person?.committees.map((item) => [item.committeeId, item.probation]).sort()).toEqual(
      [
        [committeeId, false],
        [other, true],
      ].sort(),
    );
  });

  it("el estado es el de la membresía: quien sale a licencia llega en licencia", async () => {
    const { termId, committeeId, actor } = await arrange();
    const personId = await seedVeteran("licencia@eafit.edu.co");
    await seedCommitteeMembership(personId, committeeId, termId);
    const leaveUntil = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    await changeMembershipStatusAs(actor, personId, {
      to: "ON_LEAVE",
      reason: "Licencia sintética",
      leaveUntil,
    });
    expect(await standing(termId, personId)).toMatchObject({ status: "ON_LEAVE", isNew: false });
  });
});

// Caracterización (DT-223): con qué requisito de asambleas llega cada persona al cálculo. El de un
// miembro activo es su ajuste o, si no tiene, el del término; quien no está activo llega con el del
// término aunque tenga un ajuste, que sale de las ocasiones ya cargadas y no de la lectura de asambleas.
describe("cargador de hechos: el requisito de asambleas de cada persona", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  const ADJUSTMENT = {
    requiredOrdinary: 0,
    requiresBoardElection: false,
    requiresRunoff: true,
    reason: "Intercambio sintético",
  };
  /** El del término: una ordinaria, la elección de junta que existe y no la segunda vuelta cancelada. */
  const TERM_REQUIREMENT = {
    requiredOrdinary: 1,
    requiresBoardElection: true,
    requiresRunoff: false,
    adjusted: false,
    reason: null,
  };

  /**
   * Un término con elección de junta y una segunda vuelta cancelada, y cinco personas del mismo comité:
   * una activa con ajuste, una activa sin ajuste y, con el mismo ajuste, una en licencia, una honoraria
   * y una de baja, que sigue en el roster del término con su pertenencia cerrada.
   */
  async function arrange() {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const actor = { personId: await seedVeteran("gh@eafit.edu.co"), ip: null };
    const people = {
      adjusted: await seedVeteran("ajustada@eafit.edu.co"),
      plain: await seedVeteran("sin-ajuste@eafit.edu.co"),
      onLeave: await seedVeteran("licencia@eafit.edu.co"),
      honorary: await seedVeteran("honoraria@eafit.edu.co"),
      departed: await seedVeteran("baja@eafit.edu.co"),
    };
    for (const personId of Object.values(people)) {
      await seedCommitteeMembership(personId, committeeId, termId);
    }
    await seedOccasion(termId, { kind: "ASSEMBLY", assemblyKind: "BOARD_ELECTION", points: 0 });
    await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "RUNOFF",
      points: 0,
      status: "CANCELLED",
    });
    await adjustRequirementAs(actor, { ...ADJUSTMENT, termId, personId: people.adjusted });
    await adjustRequirementAs(actor, { ...ADJUSTMENT, termId, personId: people.onLeave });
    await adjustRequirementAs(actor, { ...ADJUSTMENT, termId, personId: people.honorary });
    await adjustRequirementAs(actor, { ...ADJUSTMENT, termId, personId: people.departed });
    await changeMembershipStatusAs(actor, people.onLeave, {
      to: "ON_LEAVE",
      reason: "Licencia sintética",
      leaveUntil: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });
    await changeMembershipStatusAs(actor, people.honorary, {
      to: "HONORARY",
      reason: "Honoraria sintética",
    });
    await endMembershipAs(actor, people.departed, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    return { termId, people };
  }

  /** Lo que llega al cálculo pidiendo solo a esa persona, como Mi OE y el recálculo por persona. */
  async function requirementOf(termId: string, personId: string) {
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("sin hechos");
    const [person] = await loadPeopleFacts(facts, [personId]);
    if (!person) throw new Error("la persona no está en el roster");
    return { status: person.status, requirement: person.assemblyRequirement };
  }

  it("un activo con ajuste llega con su ajuste y no con el requisito del término", async () => {
    const { termId, people } = await arrange();
    expect(await requirementOf(termId, people.adjusted)).toEqual({
      status: "ACTIVE",
      requirement: {
        requiredOrdinary: ADJUSTMENT.requiredOrdinary,
        requiresBoardElection: ADJUSTMENT.requiresBoardElection,
        requiresRunoff: ADJUSTMENT.requiresRunoff,
        adjusted: true,
        reason: ADJUSTMENT.reason,
      },
    });
  });

  it("un activo sin ajuste llega con el requisito del término", async () => {
    const { termId, people } = await arrange();
    expect(await requirementOf(termId, people.plain)).toEqual({
      status: "ACTIVE",
      requirement: TERM_REQUIREMENT,
    });
  });

  // Los tres estados que no son activo, no solo la licencia: una guarda que excluyera a uno solo
  // dejaba pasar el ajuste de los otros dos sin que nada fallara. Si el ajuste debería valerles es la
  // decisión abierta 65 (DT-318); acá se fija lo de hoy.
  it.each([
    ["en licencia", "onLeave", "ON_LEAVE"],
    ["honoraria", "honorary", "HONORARY"],
    ["de baja", "departed", "INACTIVE"],
  ] as const)("quien está %s llega con el requisito del término aunque tenga un ajuste (decisión abierta 65)", async (_estado, who, status) => {
    const { termId, people } = await arrange();
    expect(await requirementOf(termId, people[who])).toEqual({
      status,
      requirement: TERM_REQUIREMENT,
    });
  });

  it("pedir el término entero le da a cada persona el mismo requisito que pedirla sola", async () => {
    const { termId, people } = await arrange();
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("sin hechos");
    const everyone = await loadPeopleFacts(facts);
    for (const personId of Object.values(people)) {
      expect(everyone.find((item) => item.personId === personId)?.assemblyRequirement).toEqual(
        (await requirementOf(termId, personId)).requirement,
      );
    }
  });
});

// DT-223: la permanencia de una persona se arma con sus filas. Antes leía a todos los miembros
// activos, todos los ajustes del término y todas las asistencias a sus asambleas para quedarse con un
// requisito.
describe("la permanencia de una persona no carga a toda la OE", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  const tally = (queries: CountedQuery[]) => ({
    queries: queries.length,
    rows: queries.reduce((total, query) => total + query.rows, 0),
  });

  it("pedirla y recalcularla manda las mismas consultas y lee las mismas filas con 5 miembros que con 200", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const actor = { personId: await seedVeteran("gh@eafit.edu.co"), ip: null };
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "CLOSED",
    });
    // Cada miembro suma una fila a cada lectura que crecía con la OE: su membresía activa, su
    // asistencia a la asamblea del término y su ajuste del requisito.
    const grow = async (from: number, to: number) => {
      const ids: string[] = [];
      for (let n = from; n < to; n += 1) {
        const personId = await seedVeteran(`miembro-${n}@eafit.edu.co`);
        await seedCommitteeMembership(personId, committeeId, termId);
        await seedCheckIn(assembly.id, personId);
        await adjustRequirementAs(actor, {
          termId,
          personId,
          requiredOrdinary: 2,
          requiresBoardElection: false,
          requiresRunoff: false,
          reason: "Ajuste sintético",
        });
        ids.push(personId);
      }
      return ids;
    };
    const [target = ""] = await grow(0, 5);
    const now = new Date();
    const measure = async () => {
      const recalc = await countQueries(() => recomputeSnapshots(termId, target, now));
      const read = await countQueries(() => getPersonPermanence(target, termId, now));
      return {
        recalc: { written: recalc.result, ...tally(recalc.queries) },
        read: tally(read.queries),
        result: read.result?.result,
      };
    };
    // La primera corrida deja escrito el snapshot y lo que el proceso guarde en memoria: no se mide.
    await measure();
    const small = await measure();
    await grow(5, 200);
    const large = await measure();

    expect(small.result?.mandatory).toBeDefined();
    expect(large.result).toEqual(small.result);
    expect(large.read).toEqual(small.read);
    expect(large.recalc).toEqual(small.recalc);
  });
});

// DT-326 (a): el requisito «del término» sale de las ocasiones que la permanencia ya leyó. Antes
// `participation` volvía a leer las asambleas del término para derivarlo por su lado.
describe("la permanencia de una persona lee las ocasiones del término una sola vez", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  const occasionReads = (queries: CountedQuery[]) =>
    queries.map((query) => query.text).filter((text) => text.includes('from "occasion"'));
  const rowsOf = (queries: CountedQuery[]) =>
    queries.reduce((total, query) => total + query.rows, 0);

  it("pedirla y recalcularla no vuelven a leer las asambleas para el requisito: una consulta menos cada una", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3");
    const actor = { personId: await seedVeteran("gh@eafit.edu.co"), ip: null };
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "CLOSED",
    });
    // La misma escena chica de la prueba de arriba: cinco miembros, cada uno con su asistencia a la
    // asamblea del término y su ajuste del requisito.
    const ids: string[] = [];
    for (let n = 0; n < 5; n += 1) {
      const personId = await seedVeteran(`miembro-${n}@eafit.edu.co`);
      await seedCommitteeMembership(personId, committeeId, termId);
      await seedCheckIn(assembly.id, personId);
      await adjustRequirementAs(actor, {
        termId,
        personId,
        requiredOrdinary: 2,
        requiresBoardElection: false,
        requiresRunoff: false,
        reason: "Ajuste sintético",
      });
      ids.push(personId);
    }
    const [target = ""] = ids;
    const now = new Date();
    // La primera corrida deja escrito el snapshot y lo que el proceso guarde en memoria: no se mide.
    await recomputeSnapshots(termId, target, now);
    await getPersonPermanence(target, termId, now);

    const recalc = await countQueries(() => recomputeSnapshots(termId, target, now));
    const read = await countQueries(() => getPersonPermanence(target, termId, now));

    expect(read.result?.result?.mandatory).toBeDefined();
    expect(occasionReads(read.queries)).toHaveLength(1);
    expect(occasionReads(recalc.queries)).toHaveLength(1);
    // Eran 16 y 17 (ADR-121 regla 3): la lectura de las asambleas del término ya no sale.
    expect(read.queries.length).toBeLessThanOrEqual(15);
    expect(recalc.queries.length).toBeLessThanOrEqual(16);
    // Y eran 7 filas: la de la asamblea, que esa lectura traía, tampoco.
    expect(rowsOf(read.queries)).toBeLessThanOrEqual(6);
    expect(rowsOf(recalc.queries)).toBeLessThanOrEqual(6);
  });
});
