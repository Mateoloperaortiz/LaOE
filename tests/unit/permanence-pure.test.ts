import { describe, expect, it } from "vitest";
import {
  parseParams,
  type Rule,
  type RuleInputValues,
  ruleInputSchema,
  toRule,
} from "@/modules/permanence/domain/params";
import {
  type CommitteeFact,
  closedResults,
  computePerson,
  conditionFor,
  deviatesFromNominal,
  distribution,
  evaluationWindow,
  exitEndReason,
  finalStateFor,
  type GroupFact,
  marginFor,
  noticesFor,
  type OccasionFact,
  type PermanenceConfig,
  type PersonFacts,
  personStanding,
  proposalReason,
  proposeDecisions,
  round2,
  ruleApplies,
  stateFor,
  type TermFacts,
  tableSums,
  thresholdFor,
  tierFor,
} from "@/modules/permanence/domain/permanence-pure";
import { parseGeneral, parseResults } from "@/modules/permanence/domain/snapshot-pure";
import {
  referenceCommitteeRules,
  referenceGeneralRules,
} from "@/modules/permanence/domain/templates";
import { tList } from "@/shared/copy";

// Cálculo de permanencia (10-verificacion, unit): las tablas de referencia de 2026-2 reproducen las
// hojas de GH criterio por criterio, con el ejemplo de Pixel 75 % y Cigma 95 %.

const CONFIG: PermanenceConfig = {
  thresholds: { active: 60, new: 80, probation: 80, transfer: 70 },
  probationMargins: { active: 20, new: 0, probation: 0, transfer: 0 },
  evaluationWindowDays: 14,
  warningDays: 21,
};

const TERM = {
  id: "term-2026-2",
  code: "2026-2",
  semester: 2,
  startsOn: "2026-07-13",
  endsOn: "2026-12-05",
  requiredOrdinaryAssemblies: 1,
  generalNominal: 50,
  committeeNominal: 60,
  pointsClosedAt: null,
  permanenceClosedAt: null,
};

/** Un lunes de octubre: mitad de semestre, ventana de evaluación cerrada. */
const NOW = new Date("2026-10-05T15:00:00Z");

let ruleCounter = 0;
function rule(
  input: RuleInputValues,
  scope: "GENERAL" | "COMMITTEE" = "GENERAL",
  committeeId: string | null = null,
): Rule {
  ruleCounter += 1;
  const parsed = ruleInputSchema.parse(input);
  return toRule({
    id: `rule-${ruleCounter}`,
    termId: TERM.id,
    scope,
    committeeId,
    key: parsed.key,
    label: parsed.label,
    description: parsed.description,
    weight: parsed.weight,
    appliesTo: parsed.appliesTo,
    sortOrder: parsed.sortOrder,
    computation: parsed.computation,
    params: parsed.params,
  });
}

function generalRules(): Rule[] {
  return referenceGeneralRules(3).map((input) => rule(input));
}

function committeeRules(committeeId: string): Rule[] {
  return referenceCommitteeRules().map((input) => rule(input, "COMMITTEE", committeeId));
}

let occasionCounter = 0;
function occ(overrides: Partial<OccasionFact> & { startsAt: Date }): OccasionFact {
  occasionCounter += 1;
  return {
    id: overrides.id ?? `occ-${occasionCounter}`,
    title: overrides.title ?? `Ocasión ${occasionCounter}`,
    location: overrides.location ?? "",
    kind: overrides.kind ?? "ACTIVITY",
    assemblyKind: overrides.assemblyKind ?? null,
    category: overrides.category ?? "OTHER",
    committeeId: overrides.committeeId ?? null,
    newMembersOnly: overrides.newMembersOnly ?? false,
    startsAt: overrides.startsAt,
    status: overrides.status ?? (overrides.startsAt <= NOW ? "CLOSED" : "OPEN"),
  };
}

function past(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}
function future(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000);
}

function group(kind: GroupFact["kind"], id: string, evaluatorIds = ["gh-director"]): GroupFact {
  return { id, kind, code: null, name: id, evaluatorIds };
}

function committee(committeeId: string, overrides: Partial<CommitteeFact> = {}): CommitteeFact {
  return {
    committeeId,
    roleCode: "MIEMBRO",
    transferredIn: false,
    probation: false,
    joinedAt: new Date("2026-07-13T00:00:00Z"),
    leftAt: null,
    ...overrides,
  };
}

function person(overrides: Partial<PersonFacts> = {}): PersonFacts {
  return {
    personId: "p1",
    status: "ACTIVE",
    isNew: false,
    probation: false,
    committees: [committee("pixel")],
    attended: new Set(),
    excused: new Set(),
    expulsionWarning: false,
    groupMemberships: [],
    leaderScores: [],
    credits: [],
    assemblyRequirement: {
      requiredOrdinary: 1,
      requiresBoardElection: true,
      requiresRunoff: false,
    },
    ...overrides,
  };
}

function facts(overrides: Partial<TermFacts> = {}): TermFacts {
  return {
    term: TERM,
    config: CONFIG,
    rules: generalRules(),
    occasions: [],
    groups: [],
    ...overrides,
  };
}

function byKey(results: ReadonlyArray<{ key: string; achieved: number; remaining: number }>) {
  return new Map(results.map((item) => [item.key, item]));
}

it("cuenta macroeventos distintos: dos GT del mismo evento no suben de nivel", () => {
  const groups: GroupFact[] = [
    {
      id: "a",
      name: "Inventiva A",
      macroeventId: "inventiva",
      kind: "GT_MACROEVENT",
      code: null,
      evaluatorIds: [],
    },
    {
      id: "b",
      name: "Inventiva B",
      macroeventId: "inventiva",
      kind: "GT_MACROEVENT",
      code: null,
      evaluatorIds: [],
    },
    {
      id: "c",
      name: "Días",
      macroeventId: "dias",
      kind: "GT_MACROEVENT",
      code: null,
      evaluatorIds: [],
    },
  ];
  const member = person({
    groupMemberships: groups.map((group) => ({
      groupId: group.id,
      evaluation: "GOOD",
      evaluatedById: "gh",
      evaluatedAt: NOW,
      note: null,
      leftAt: null,
    })),
  });
  expect(
    byKey(computePerson(facts({ groups }), member, NOW).general).get("gt-macroeventos")?.achieved,
  ).toBe(6);
  member.groupMemberships[1] = {
    groupId: "b",
    evaluation: "PENDING",
    leftAt: null,
    evaluatedAt: null,
    evaluatedById: null,
    note: null,
  };
  expect(
    byKey(computePerson(facts({ groups }), member, NOW).general).get("gt-macroeventos")?.achieved,
  ).toBe(6);
});

describe("inducción de nuevos (ADR-060 regla 13)", () => {
  const induction = {
    id: "ind",
    title: "Inducción OE",
    location: "Auditorio",
    kind: "ACTIVITY" as const,
    assemblyKind: null,
    category: "INDUCTION",
    committeeId: null,
    newMembersOnly: true,
    startsAt: new Date("2026-08-01T15:00:00Z"),
    status: "CLOSED" as const,
  };
  const now = new Date("2026-09-13T12:00:00Z");
  // Sin asambleas exigidas, para aislar la inducción en `met`.
  const sinAsambleas = { requiredOrdinary: 0, requiresBoardElection: false, requiresRunoff: false };

  it("es obligatoria solo para nuevos y no expulsa", () => {
    const unscheduled = computePerson(
      facts({ occasions: [] }),
      person({ isNew: true, assemblyRequirement: sinAsambleas }),
      now,
    );
    expect(unscheduled.mandatory.induction).toMatchObject({ required: true, pending: true });
    expect(unscheduled.mandatory.met).toBe(false);
    const veteran = computePerson(
      facts({ occasions: [induction] }),
      person({ assemblyRequirement: sinAsambleas }),
      now,
    );
    expect(veteran.mandatory.induction).toMatchObject({ required: false, attended: false });
    expect(veteran.mandatory.met).toBe(true);
    const missed = computePerson(
      facts({ occasions: [induction] }),
      person({ isNew: true, assemblyRequirement: sinAsambleas }),
      now,
    );
    expect(missed.mandatory.induction).toMatchObject({
      required: true,
      attended: false,
      pending: false,
    });
    expect(missed.mandatory.met).toBe(false);
    expect(missed.mandatory.lost).toEqual([]);
    const attended = computePerson(
      facts({ occasions: [induction] }),
      person({ isNew: true, attended: new Set(["ind"]), assemblyRequirement: sinAsambleas }),
      now,
    );
    expect(attended.mandatory.induction.attended).toBe(true);
    expect(attended.mandatory.met).toBe(true);
  });
});

describe("condición y umbral (ADR-027)", () => {
  it("reportar como activo en un comité no cambia la condición de nuevo en el otro", () => {
    const result = computePerson(
      facts(),
      person({
        isNew: true,
        committees: [{ ...committee("a3"), reportAsVeteran: true }, committee("pixel")],
      }),
      NOW,
    );
    expect(result.results.find((row) => row.committeeId === "a3")?.condition).toBe("ACTIVE");
    expect(result.results.find((row) => row.committeeId === "pixel")?.condition).toBe("NEW");
  });
  it("elige la condición y el umbral máximo que aplica", () => {
    const active = { isNew: false, probation: false, transferredIn: false };
    expect(conditionFor(active)).toBe("ACTIVE");
    expect(thresholdFor(active, CONFIG.thresholds)).toBe(60);
    expect(conditionFor({ ...active, isNew: true })).toBe("NEW");
    expect(thresholdFor({ ...active, isNew: true }, CONFIG.thresholds)).toBe(80);
    expect(conditionFor({ ...active, probation: true })).toBe("PROBATION");
    expect(thresholdFor({ ...active, probation: true }, CONFIG.thresholds)).toBe(80);
    expect(conditionFor({ ...active, transferredIn: true })).toBe("TRANSFER");
    expect(thresholdFor({ ...active, transferredIn: true }, CONFIG.thresholds)).toBe(70);
    // Prueba con transferencia: el mayor (supuesto de ADR-036).
    expect(
      thresholdFor({ ...active, probation: true, transferredIn: true }, CONFIG.thresholds),
    ).toBe(80);
  });

  it("las reglas de nuevos aplican solo a nuevos y las de veteranos a los demás", () => {
    expect(ruleApplies("ALL", true)).toBe(true);
    expect(ruleApplies("NEW", true)).toBe(true);
    expect(ruleApplies("NEW", false)).toBe(false);
    expect(ruleApplies("VETERAN", false)).toBe(true);
    expect(ruleApplies("VETERAN", true)).toBe(false);
  });

  it("los tramos de GT dan 4, 6 y 8 con uno, dos y tres o más grupos", () => {
    const tiers = [
      { count: 1, value: 4 },
      { count: 2, value: 6 },
      { count: 3, value: 8 },
    ];
    expect(tierFor(tiers, 0)).toBe(0);
    expect(tierFor(tiers, 1)).toBe(4);
    expect(tierFor(tiers, 2)).toBe(6);
    expect(tierFor(tiers, 3)).toBe(8);
    expect(tierFor(tiers, 5)).toBe(8);
  });
});

describe("tablas de referencia", () => {
  it("la general suma 50 para veteranos y 45 para nuevos, y A3 suma 30", () => {
    expect(tableSums(generalRules())).toEqual({ veterans: 50, newcomers: 45 });
    expect(tableSums(committeeRules("a3"))).toEqual({ veterans: 30, newcomers: 30 });
    expect(deviatesFromNominal(50, 50)).toBe(false);
    expect(deviatesFromNominal(45, 50)).toBe(true);
    expect(deviatesFromNominal(30, 60)).toBe(true);
  });

  it("los parámetros se validan por tipo de cálculo", () => {
    expect(() => parseParams("CHECKIN_COUNT", { perUnit: 2 })).toThrow();
    expect(() => parseParams("GROUP_EVALUATED", { groupKind: "GAP", mode: "TIERS" })).toThrow();
    expect(() =>
      parseParams("GROUP_EVALUATED", { groupKind: "GAP_OE", mode: "PER_GROUP" }),
    ).toThrow();
    // ADR-071: la equivalencia no admite el propio tipo ni repetidos.
    expect(() =>
      parseParams("GROUP_EVALUATED", { groupKind: "GAP", alsoCounts: ["GAP"] }),
    ).toThrow();
    expect(() =>
      parseParams("GROUP_EVALUATED", {
        groupKind: "GAP",
        alsoCounts: ["GT_MACROEVENT", "GT_MACROEVENT"],
      }),
    ).toThrow();
    expect(
      parseParams("GROUP_EVALUATED", { groupKind: "GAP", alsoCounts: ["GT_MACROEVENT"] }),
    ).toEqual({
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED", alsoCounts: ["GT_MACROEVENT"] },
    });
    expect(parseParams("CHECKIN_COUNT", { category: "INTEGRATION", perUnit: 2 })).toEqual({
      computation: "CHECKIN_COUNT",
      params: { category: "INTEGRATION", committee: "ANY", newMembersOnly: "ANY", perUnit: 2 },
    });
    expect(parseParams("MANUAL", undefined)).toEqual({ computation: "MANUAL", params: {} });
    const invalid = ruleInputSchema.safeParse({
      key: "x",
      label: "Criterio",
      weight: 5,
      computation: "CHECKIN_THRESHOLD",
      params: { category: "INTEGRATION" },
    });
    expect(invalid.success).toBe(false);
  });
});

describe("hoja de GH: veterano con general 45, Pixel 75 % y Cigma 95 %", () => {
  const integrations = Array.from({ length: 10 }, (_, i) =>
    occ({ id: `int-${i}`, category: "INTEGRATION", startsAt: past(60 - i * 5) }),
  );
  const newOnly = occ({
    id: "int-nuevos",
    category: "INTEGRATION",
    newMembersOnly: true,
    startsAt: past(70),
  });
  const assemblies = [
    occ({ id: "asm-1", kind: "ASSEMBLY", assemblyKind: "ORDINARY", startsAt: past(50) }),
    occ({ id: "asm-2", kind: "ASSEMBLY", assemblyKind: "ORDINARY", startsAt: past(20) }),
    occ({ id: "asm-3", kind: "ASSEMBLY", assemblyKind: "BOARD_ELECTION", startsAt: past(5) }),
  ];
  const matches = [1, 2, 3].map((i) =>
    occ({ id: `match-${i}`, category: "ATHLETIC_MATCH", startsAt: past(i * 7) }),
  );
  const groups = [
    group("GT_MACROEVENT", "gt-inventiva"),
    group("GT_MACROEVENT", "gt-dias"),
    group("GT_MACROEVENT", "gt-enfemenino"),
    group("GAP", "gap-1"),
    group("GAP_OE", "gap-oe-vtg"),
    group("GAP_OE", "gap-oe-assessment"),
    group("WORK_COMMITTEE", "cgh"),
    group("BARRA_BRAVA", "barra"),
    group("NEW_MEMBER_TASK", "decoracion", ["gh-head"]),
  ];
  const good = (groupId: string) => ({
    groupId,
    evaluation: "GOOD" as const,
    leftAt: null,
    evaluatedById: "gh-director",
    evaluatedAt: past(1),
    note: null,
  });
  const pixelRules = [
    rule(
      { key: "eventos", label: "Eventos de Pixel", weight: 30, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "pixel",
    ),
  ];
  const cigmaRules = [
    rule(
      { key: "eventos", label: "Eventos de Cigma", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "cigma",
    ),
  ];
  const termFacts = facts({
    rules: [...generalRules(), ...pixelRules, ...cigmaRules],
    occasions: [...integrations, newOnly, ...assemblies, ...matches],
    groups,
  });
  const veteran = person({
    committees: [committee("pixel"), committee("cigma")],
    attended: new Set([
      ...integrations.slice(0, 5).map((i) => i.id),
      newOnly.id,
      ...assemblies.map((a) => a.id),
    ]),
    groupMemberships: [
      good("gt-inventiva"),
      good("gt-dias"),
      good("gt-enfemenino"),
      good("gap-1"),
      good("gap-oe-vtg"),
      good("gap-oe-assessment"),
      good("cgh"),
    ],
    credits: [
      { ruleId: pixelRules[0]?.id ?? "", value: 30, reason: "Eventos" },
      { ruleId: cigmaRules[0]?.id ?? "", value: 50, reason: "Eventos" },
    ],
  });

  it("reproduce cada criterio de la tabla general", () => {
    const result = computePerson(termFacts, veteran, NOW);
    const general = byKey(result.general);
    expect(general.get("integraciones")?.achieved).toBe(10); // 5 de 10 a 2 % (la de solo nuevos no cuenta)
    expect(general.get("asambleas")?.achieved).toBe(10); // 3 asambleas
    expect(general.get("gt-macroeventos")?.achieved).toBe(8); // tres GT
    expect(general.get("gap")?.achieved).toBe(5);
    expect(general.get("gap-oe")?.achieved).toBe(6); // 3 + 3
    expect(general.get("comite-de-trabajo")?.achieved).toBe(6);
    expect(general.get("barra-brava")?.achieved).toBe(0); // partidos sin grupo evaluado
    expect(general.has("decoracion-de-oficina")).toBe(false); // criterios de nuevos no aplican
    expect(result.generalTotal).toBe(45);
    expect(result.generalMax).toBe(50);
  });

  it("da un resultado por comité: Pixel 75 % y Cigma 95 % cumplen con umbral 60", () => {
    const result = computePerson(termFacts, veteran, NOW);
    const pixel = result.results.find((item) => item.committeeId === "pixel");
    const cigma = result.results.find((item) => item.committeeId === "cigma");
    expect(pixel).toMatchObject({
      condition: "ACTIVE",
      threshold: 60,
      committeeTotal: 30,
      total: 75,
      state: "EN_CAMINO",
      finalState: "CUMPLE",
    });
    expect(cigma).toMatchObject({
      threshold: 60,
      committeeTotal: 50,
      committeeMax: 60,
      total: 95,
      finalState: "CUMPLE",
    });
    expect(result.mandatory).toMatchObject({ met: true, missing: [], lost: [] });
    expect(proposeDecisions(result)).toEqual({
      committees: [
        { committeeId: "pixel", proposed: "CONTINUES", reason: 0 },
        { committeeId: "cigma", proposed: "CONTINUES", reason: 0 },
      ],
      person: { proposed: "CONTINUES", reason: 0 },
    });
  });

  it("el JSON del snapshot vuelve a leerse igual", () => {
    const result = computePerson(termFacts, veteran, NOW);
    const roundTrip = JSON.parse(JSON.stringify(result));
    expect(parseGeneral(roundTrip.general)).toEqual(result.general);
    expect(parseResults(roundTrip.results)).toEqual(result.results);
    expect(parseGeneral({ basura: true })).toEqual([]);
  });

  it("un nuevo usa sus criterios: integración de nuevos y decoración, y llega al máximo de 45", () => {
    const newcomer = person({
      isNew: true,
      committees: [committee("pixel")],
      attended: new Set([
        ...integrations.slice(0, 5).map((i) => i.id),
        newOnly.id,
        ...assemblies.map((a) => a.id),
        ...matches.map((m) => m.id),
      ]),
      groupMemberships: [good("gap-1"), good("barra"), good("decoracion")],
    });
    const result = computePerson(termFacts, newcomer, NOW);
    const general = byKey(result.general);
    expect(general.get("integracion-de-nuevos")?.achieved).toBe(5);
    expect(general.get("decoracion-de-oficina")?.achieved).toBe(10);
    expect(general.get("barra-brava")?.achieved).toBe(5);
    expect(general.has("gt-macroeventos")).toBe(false);
    expect(result.generalMax).toBe(45);
    expect(result.generalTotal).toBe(45);
    const pixel = result.results[0];
    expect(pixel?.condition).toBe("NEW");
    expect(pixel?.threshold).toBe(80);
  });
});

describe("estados y margen de prueba (ADR-027, ADR-028)", () => {
  it("con el término abierto decide por lo que aún es posible", () => {
    expect(stateFor(65, 0, 60, 10, false)).toBe("EN_CAMINO");
    expect(stateFor(40, 30, 60, 10, false)).toBe("EN_CAMINO");
    expect(stateFor(55, 8, 60, 10, false)).toBe("EN_RIESGO");
    expect(stateFor(50, 10, 60, 10, false)).toBe("EN_RIESGO");
    expect(stateFor(50, 9, 60, 10, false)).toBe("NO_ALCANZA");
  });

  it("cerrado: cumple, prueba dentro de la banda y no cumple más abajo", () => {
    expect(finalStateFor(60, 60, 10)).toBe("CUMPLE");
    expect(finalStateFor(50, 60, 10)).toBe("PRUEBA");
    expect(finalStateFor(49.99, 60, 10)).toBe("NO_CUMPLE");
    expect(stateFor(75, 100, 80, 10, true)).toBe("PRUEBA");
  });

  it("la banda de prueba depende de la condición (ADR-060 regla 1): 20 para activos, cero para el resto", () => {
    const margins = CONFIG.probationMargins;
    expect(marginFor("ACTIVE", margins)).toBe(20);
    expect(marginFor("NEW", margins)).toBe(0);
    expect(marginFor("PROBATION", margins)).toBe(0);
    expect(marginFor("TRANSFER", margins)).toBe(0);
    // Est. art. 7.5: entre 40 y 59 queda en prueba; bajo 40 sale.
    expect(finalStateFor(45, 60, marginFor("ACTIVE", margins))).toBe("PRUEBA");
    expect(finalStateFor(40, 60, marginFor("ACTIVE", margins))).toBe("PRUEBA");
    expect(finalStateFor(39.99, 60, marginFor("ACTIVE", margins))).toBe("NO_CUMPLE");
    // Est. art. 11.4 y 11.5: sin banda para nuevos y en prueba.
    expect(finalStateFor(79.99, 80, marginFor("NEW", margins))).toBe("NO_CUMPLE");
    expect(finalStateFor(79.99, 80, marginFor("PROBATION", margins))).toBe("NO_CUMPLE");
    // La banda de riesgo de los estados abiertos sigue siendo de 10 puntos, para toda condición.
    expect(stateFor(72, 5, 80, 0, false)).toBe("NO_ALCANZA");
    expect(stateFor(72, 8, 80, 0, false)).toBe("EN_RIESGO");
    expect(stateFor(72, 18, 80, 0, false)).toBe("EN_CAMINO");
  });

  it("un activo con 45 queda en prueba y con 38 sale; un nuevo con 72 sale (Est. art. 7.5 y 11.4)", () => {
    const eventos = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const termFacts = facts({
      rules: [eventos],
      term: { ...TERM, permanenceClosedAt: new Date() },
    });
    const at = (value: number, overrides: Partial<PersonFacts> = {}) =>
      computePerson(
        termFacts,
        person({
          committees: [committee("a3")],
          credits: [{ ruleId: eventos.id, value, reason: "" }],
          ...overrides,
        }),
        NOW,
      ).results[0];
    expect(at(45)).toMatchObject({ condition: "ACTIVE", threshold: 60, finalState: "PRUEBA" });
    expect(at(38)).toMatchObject({ condition: "ACTIVE", threshold: 60, finalState: "NO_CUMPLE" });
    expect(at(60)).toMatchObject({ condition: "ACTIVE", finalState: "CUMPLE" });
    expect(at(72, { isNew: true })).toMatchObject({
      condition: "NEW",
      threshold: 80,
      finalState: "NO_CUMPLE",
    });
  });

  it("la prueba fijada en un solo comité rige solo ahí (ADR-060 regla 2)", () => {
    const eventos = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const otros = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "pixel",
    );
    const termFacts = facts({
      rules: [eventos, otros],
      term: { ...TERM, permanenceClosedAt: new Date() },
    });
    const result = computePerson(
      termFacts,
      person({
        committees: [committee("a3", { probation: true }), committee("pixel")],
        credits: [
          { ruleId: eventos.id, value: 60, reason: "" },
          { ruleId: otros.id, value: 60, reason: "" },
        ],
      }),
      NOW,
    );
    const [a3, pixel] = result.results;
    expect(a3).toMatchObject({ condition: "PROBATION", threshold: 80, finalState: "NO_CUMPLE" });
    expect(pixel).toMatchObject({ condition: "ACTIVE", threshold: 60, finalState: "CUMPLE" });
    // La persona figura en prueba porque lo está en al menos un comité.
    expect(result.probation).toBe(true);
  });

  it("en prueba exige 80 y una transferencia 70 solo en ese comité", () => {
    const eventos = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const otros = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "pixel",
    );
    const termFacts = facts({
      rules: [eventos, otros],
      term: { ...TERM, permanenceClosedAt: new Date() },
    });
    const onProbation = person({
      probation: true,
      committees: [committee("a3")],
      credits: [{ ruleId: eventos.id, value: 55, reason: "" }],
    });
    const probationResult = computePerson(termFacts, onProbation, NOW).results[0];
    expect(probationResult).toMatchObject({
      condition: "PROBATION",
      threshold: 80,
      total: 55,
      state: "NO_CUMPLE",
    });
    const transferred = person({
      committees: [committee("a3", { transferredIn: true }), committee("pixel")],
      credits: [
        { ruleId: eventos.id, value: 65, reason: "" },
        { ruleId: otros.id, value: 65, reason: "" },
      ],
    });
    const [a3, pixel] = computePerson(termFacts, transferred, NOW).results;
    // El crédito de 65 se acota al peso (60): en la transferencia falta para 70 y no hay banda de
    // prueba (Est. art. 8.3), así que sale de ese comité; en el otro comité cumple.
    expect(a3).toMatchObject({
      condition: "TRANSFER",
      threshold: 70,
      total: 60,
      finalState: "NO_CUMPLE",
    });
    expect(pixel).toMatchObject({
      condition: "ACTIVE",
      threshold: 60,
      total: 60,
      finalState: "CUMPLE",
    });
  });
});

describe("lo que aún es posible", () => {
  const integraciones = rule({
    key: "integraciones",
    label: "Integraciones",
    weight: 10,
    computation: "CHECKIN_COUNT",
    params: { category: "INTEGRATION", perUnit: 2, expectedCount: 10 },
  });

  it("sin calendario y sin esperadas nadie arranca en no alcanza", () => {
    const sinEsperadas = rule({
      key: "integraciones",
      label: "Integraciones",
      weight: 10,
      computation: "CHECKIN_COUNT",
      params: { category: "INTEGRATION", perUnit: 2 },
    });
    const result = computePerson(facts({ rules: [sinEsperadas] }), person(), NOW);
    const criterion = result.general[0];
    expect(criterion?.achieved).toBe(0);
    expect(criterion?.remaining).toBe(10);
    expect(criterion?.detail).toMatchObject({ type: "CHECKIN_COUNT", opportunities: null });
  });

  it("con esperadas cuenta las que faltan aunque el calendario no esté cargado", () => {
    const occurred = [1, 2, 3, 4].map((i) =>
      occ({ category: "INTEGRATION", startsAt: past(i * 5) }),
    );
    const result = computePerson(
      facts({ rules: [integraciones], occasions: occurred }),
      person({ attended: new Set([occurred[0]?.id ?? ""]) }),
      NOW,
    );
    const criterion = result.general[0];
    expect(criterion?.achieved).toBe(2);
    // Quedan 6 esperadas: 12 puntos posibles, acotados al peso restante (8).
    expect(criterion?.remaining).toBe(8);
    expect(criterion?.detail).toMatchObject({ opportunities: 6, occurred: 4 });
  });

  it("con todo ocurrido y sin asistir no alcanza", () => {
    const occurred = Array.from({ length: 10 }, (_, i) =>
      occ({ category: "INTEGRATION", startsAt: past(i + 1) }),
    );
    const reuniones = rule(
      { key: "reuniones", label: "Reuniones", weight: 50, computation: "CHECKIN_RATE", params: {} },
      "COMMITTEE",
      "a3",
    );
    const meetings = [1, 2, 3].map((i) =>
      occ({ category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(i * 7) }),
    );
    const result = computePerson(
      facts({ rules: [integraciones, reuniones], occasions: [...occurred, ...meetings] }),
      person({ committees: [committee("a3")] }),
      NOW,
    );
    expect(result.results[0]).toMatchObject({
      total: 0,
      remaining: 0,
      state: "NO_ALCANZA",
      finalState: "NO_CUMPLE",
    });
  });

  it("una reunión con excusa aceptada sale del denominador de la tasa (ADR-060 regla 5)", () => {
    const reuniones = rule(
      {
        key: "reuniones",
        label: "Reuniones",
        weight: 15,
        computation: "CHECKIN_RATE",
        params: { category: "COMMITTEE_MEETING" },
      },
      "COMMITTEE",
      "a3",
    );
    const meetings = [1, 2, 3, 4].map((n) =>
      occ({
        id: `m${n}`,
        category: "COMMITTEE_MEETING",
        committeeId: "a3",
        startsAt: past(n * 7),
      }),
    );
    const termFacts = facts({ rules: [reuniones], occasions: meetings });
    const sinExcusa = computePerson(
      termFacts,
      person({ committees: [committee("a3")], attended: new Set(["m1", "m2"]) }),
      NOW,
    );
    const conExcusa = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["m1", "m2"]),
        excused: new Set(["m3", "m4"]),
      }),
      NOW,
    );
    const rateOf = (result: ReturnType<typeof computePerson>) =>
      result.results[0]?.criteria[0]?.detail;
    expect(rateOf(sinExcusa)).toMatchObject({
      type: "CHECKIN_RATE",
      attended: 2,
      held: 4,
      rate: 0.5,
    });
    expect(rateOf(conExcusa)).toMatchObject({
      type: "CHECKIN_RATE",
      attended: 2,
      held: 2,
      rate: 1,
    });
  });

  it("la tasa de reuniones solo cuenta las reuniones en que la persona estaba en el comité", () => {
    const reuniones = rule(
      { key: "reuniones", label: "Reuniones", weight: 15, computation: "CHECKIN_RATE", params: {} },
      "COMMITTEE",
      "a3",
    );
    const meetings = [
      occ({ id: "m-before", category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(40) }),
      occ({ id: "m-1", category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(14) }),
      occ({ id: "m-2", category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(7) }),
      occ({ id: "m-next", category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: future(7) }),
      occ({
        id: "m-other",
        category: "COMMITTEE_MEETING",
        committeeId: "pixel",
        startsAt: past(7),
      }),
    ];
    const result = computePerson(
      facts({ rules: [reuniones], occasions: meetings }),
      person({
        committees: [committee("a3", { joinedAt: past(30) })],
        attended: new Set(["m-1", "m-other"]),
      }),
      NOW,
    );
    const criterion = result.results[0]?.criteria[0];
    expect(criterion?.detail).toMatchObject({
      type: "CHECKIN_RATE",
      attended: 1,
      held: 2,
      future: 1,
      rate: 0.5,
    });
    expect(criterion?.achieved).toBe(7.5);
    // Con la próxima: 2 de 3 → 10 puntos; faltan 2,5.
    expect(criterion?.remaining).toBe(2.5);
  });

  it("los grupos valen el peso completo antes de la ventana y solo lo pendiente dentro de ella", () => {
    const gap = rule({
      key: "gap",
      label: "GAP",
      weight: 5,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED" },
    });
    const termFacts = facts({
      rules: [gap],
      groups: [group("GAP", "gap-1"), group("GAP", "gap-2")],
    });
    const outside = computePerson(termFacts, person(), NOW).general[0];
    expect(outside?.remaining).toBe(5);
    const inWindow = new Date("2026-11-28T15:00:00Z");
    const withoutGroup = computePerson(termFacts, person(), inWindow).general[0];
    expect(withoutGroup?.remaining).toBe(0);
    const pending = person({
      groupMemberships: [
        {
          groupId: "gap-1",
          evaluation: "PENDING",
          leftAt: null,
          evaluatedById: null,
          evaluatedAt: null,
          note: null,
        },
      ],
    });
    expect(computePerson(termFacts, pending, inWindow).general[0]?.remaining).toBe(5);
    const insufficient = person({
      groupMemberships: [
        {
          groupId: "gap-1",
          evaluation: "INSUFFICIENT",
          leftAt: null,
          evaluatedById: "gh",
          evaluatedAt: inWindow,
          note: "Faltó",
        },
      ],
    });
    expect(computePerson(termFacts, insufficient, inWindow).general[0]).toMatchObject({
      achieved: 0,
      remaining: 0,
    });
  });

  // ADR-071: el criterio GAP acepta un GT de macroevento acreditado.
  const IN_WINDOW = new Date("2026-11-28T15:00:00Z");

  function joined(groupId: string, evaluation: "PENDING" | "GOOD" | "INSUFFICIENT") {
    return {
      groupId,
      evaluation,
      leftAt: null,
      evaluatedById: evaluation === "PENDING" ? null : "gh",
      evaluatedAt: evaluation === "PENDING" ? null : IN_WINDOW,
      note: null,
    };
  }

  function gapRule(params: Record<string, unknown>) {
    return rule({
      key: "gap",
      label: "GAP",
      weight: 5,
      computation: "GROUP_EVALUATED",
      params,
    });
  }

  it("un GT de macroevento acreditado cumple el GAP sin pertenencia GAP", () => {
    const termFacts = facts({
      rules: [gapRule({ groupKind: "GAP", mode: "FIXED", alsoCounts: ["GT_MACROEVENT"] })],
      groups: [group("GAP", "gap-1"), group("GT_MACROEVENT", "gt-inventiva")],
    });
    const conGt = person({ groupMemberships: [joined("gt-inventiva", "GOOD")] });
    const criterion = computePerson(termFacts, conGt, IN_WINDOW).general[0];
    expect(criterion).toMatchObject({ achieved: 5, remaining: 0 });
    // El desglose dice por qué cuenta un grupo que no es un GAP.
    expect(criterion?.detail).toMatchObject({
      type: "GROUP_EVALUATED",
      goodCount: 1,
      groups: [{ groupId: "gt-inventiva", equivalentKind: "GT_MACROEVENT" }],
    });
  });

  it("un GT pendiente deja el GAP como aún posible y un insuficiente no aporta ni bloquea", () => {
    const termFacts = facts({
      rules: [gapRule({ groupKind: "GAP", mode: "FIXED", alsoCounts: ["GT_MACROEVENT"] })],
      groups: [group("GAP", "gap-1"), group("GT_MACROEVENT", "gt-inventiva")],
    });
    const pendiente = person({ groupMemberships: [joined("gt-inventiva", "PENDING")] });
    expect(computePerson(termFacts, pendiente, IN_WINDOW).general[0]).toMatchObject({
      achieved: 0,
      remaining: 5,
    });
    const cerrado = facts({
      ...termFacts,
      term: { ...TERM, permanenceClosedAt: new Date("2026-12-20T00:00:00Z") },
    });
    expect(computePerson(cerrado, pendiente, IN_WINDOW).general[0]).toMatchObject({
      achieved: 0,
      remaining: 0,
    });
    // Insuficiente en el GT no impide cumplir por el propio GAP.
    const mixto = person({
      groupMemberships: [joined("gt-inventiva", "INSUFFICIENT"), joined("gap-1", "GOOD")],
    });
    expect(computePerson(termFacts, mixto, IN_WINDOW).general[0]?.achieved).toBe(5);
  });

  it("el GT y el GAP del mismo macroevento cuentan una vez", () => {
    const groups: GroupFact[] = [
      {
        id: "gt",
        name: "GT Inventiva",
        kind: "GT_MACROEVENT",
        code: null,
        evaluatorIds: [],
        macroeventId: "inventiva",
      },
      {
        id: "gap",
        name: "GAP Inventiva",
        kind: "GAP",
        code: null,
        evaluatorIds: [],
        macroeventId: "inventiva",
      },
      {
        id: "gap-dias",
        name: "GAP Días EAFIT",
        kind: "GAP",
        code: null,
        evaluatorIds: [],
        macroeventId: "dias",
      },
    ];
    const termFacts = facts({
      rules: [
        gapRule({
          groupKind: "GAP",
          mode: "PER_GROUP",
          perGroup: 5,
          alsoCounts: ["GT_MACROEVENT"],
        }),
      ],
      groups,
    });
    const unMacroevento = person({
      groupMemberships: [joined("gt", "GOOD"), joined("gap", "GOOD")],
    });
    expect(computePerson(termFacts, unMacroevento, IN_WINDOW).general[0]).toMatchObject({
      achieved: 5,
      detail: { goodCount: 1 },
    });
    const dos = person({ groupMemberships: [joined("gt", "GOOD"), joined("gap-dias", "GOOD")] });
    expect(computePerson(termFacts, dos, IN_WINDOW).general[0]?.detail).toMatchObject({
      goodCount: 2,
    });
  });

  it("un criterio fijado a un código ignora la equivalencia", () => {
    const termFacts = facts({
      rules: [
        gapRule({
          groupKind: "GAP",
          code: "GAP-VTG",
          mode: "FIXED",
          alsoCounts: ["GT_MACROEVENT"],
        }),
      ],
      groups: [
        { ...group("GAP", "gap-1"), code: "GAP-VTG" },
        group("GT_MACROEVENT", "gt-inventiva"),
      ],
    });
    const soloGt = person({ groupMemberships: [joined("gt-inventiva", "GOOD")] });
    expect(computePerson(termFacts, soloGt, IN_WINDOW).general[0]).toMatchObject({
      achieved: 0,
      remaining: 0,
    });
  });

  it("sin equivalencia el GAP no ve los GT: el resultado no cambia", () => {
    const termFacts = facts({
      rules: [gapRule({ groupKind: "GAP", mode: "FIXED" })],
      groups: [group("GAP", "gap-1"), group("GT_MACROEVENT", "gt-inventiva")],
    });
    const soloGt = person({ groupMemberships: [joined("gt-inventiva", "GOOD")] });
    const criterion = computePerson(termFacts, soloGt, IN_WINDOW).general[0];
    expect(criterion).toMatchObject({ achieved: 0, remaining: 0 });
    expect(criterion?.detail).toMatchObject({ type: "GROUP_EVALUATED", groups: [] });
  });

  it("GAP OE suma 3 por grupo hasta el peso y la barra brava exige partidos y grupo", () => {
    const gapOe = rule({
      key: "gap-oe",
      label: "GAP OE",
      weight: 6,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP_OE", mode: "PER_GROUP", perGroup: 3 },
    });
    const barra = rule({
      key: "barra-brava",
      label: "Barra brava",
      weight: 5,
      computation: "COMPOSITE",
      params: {
        checkIns: { category: "ATHLETIC_MATCH", minCount: 3, expectedCount: 3 },
        group: { groupKind: "BARRA_BRAVA" },
      },
    });
    const matches = [1, 2, 3].map((i) =>
      occ({ id: `match-${i}`, category: "ATHLETIC_MATCH", startsAt: past(i) }),
    );
    const termFacts = facts({
      rules: [gapOe, barra],
      occasions: matches,
      groups: [
        group("GAP_OE", "g1"),
        group("GAP_OE", "g2"),
        group("GAP_OE", "g3"),
        group("BARRA_BRAVA", "barra"),
      ],
    });
    const goodIn = (groupId: string) => ({
      groupId,
      evaluation: "GOOD" as const,
      leftAt: null,
      evaluatedById: "gh",
      evaluatedAt: past(1),
      note: null,
    });
    const three = computePerson(
      termFacts,
      person({ groupMemberships: [goodIn("g1"), goodIn("g2"), goodIn("g3")] }),
      NOW,
    );
    expect(byKey(three.general).get("gap-oe")?.achieved).toBe(6);
    const one = computePerson(termFacts, person({ groupMemberships: [goodIn("g1")] }), NOW);
    expect(byKey(one.general).get("gap-oe")?.achieved).toBe(3);
    const matchesOnly = computePerson(
      termFacts,
      person({ attended: new Set(matches.map((m) => m.id)) }),
      NOW,
    );
    expect(byKey(matchesOnly.general).get("barra-brava")).toMatchObject({
      achieved: 0,
      remaining: 5,
    });
    const both = computePerson(
      termFacts,
      person({ attended: new Set(matches.map((m) => m.id)), groupMemberships: [goodIn("barra")] }),
      NOW,
    );
    expect(byKey(both.general).get("barra-brava")).toMatchObject({ achieved: 5, remaining: 0 });
    const twoMatches = computePerson(
      termFacts,
      person({
        attended: new Set(matches.slice(0, 2).map((m) => m.id)),
        groupMemberships: [goodIn("barra")],
      }),
      NOW,
    );
    // Ya pasaron los tres partidos esperados: no queda forma de llegar al mínimo.
    expect(byKey(twoMatches.general).get("barra-brava")).toMatchObject({
      achieved: 0,
      remaining: 0,
    });
  });

  it("el puntaje obligatorio vale el peso hasta que el líder lo baje y el manual se acota al peso", () => {
    const rules = referenceCommitteeRules().map((input) => rule(input, "COMMITTEE", "a3"));
    const manual = rule(
      { key: "extra", label: "Extra", weight: 4, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const termFacts = facts({ rules: [...rules, manual] });
    const untouched = computePerson(termFacts, person({ committees: [committee("a3")] }), NOW)
      .results[0];
    const criteria = byKey(untouched?.criteria ?? []);
    expect(criteria.get("convivencia")).toMatchObject({ achieved: 5, remaining: 0 });
    expect(criteria.get("subcomite-liderazgo-destacado")).toMatchObject({
      achieved: 0,
      remaining: 10,
    });
    const scored = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        leaderScores: [
          { ruleId: rules[2]?.id ?? "", value: 3, note: "Llegó tarde", scoredAt: past(1) },
          { ruleId: rules[1]?.id ?? "", value: 8, note: null, scoredAt: past(1) },
        ],
        credits: [{ ruleId: manual.id, value: 9, reason: "Apoyo" }],
      }),
      NOW,
    ).results[0];
    const scoredCriteria = byKey(scored?.criteria ?? []);
    expect(scoredCriteria.get("convivencia")).toMatchObject({ achieved: 3, remaining: 2 });
    expect(scoredCriteria.get("subcomite-liderazgo-destacado")?.achieved).toBe(8);
    expect(scoredCriteria.get("extra")).toMatchObject({ achieved: 4, remaining: 0 });
  });
});

describe("asambleas obligatorias y propuestas del cierre", () => {
  const ordinary = occ({
    id: "ord",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    startsAt: past(30),
  });
  const election = occ({
    id: "elec",
    kind: "ASSEMBLY",
    assemblyKind: "BOARD_ELECTION",
    startsAt: past(3),
  });
  const nextOrdinary = occ({
    id: "ord-2",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    startsAt: future(10),
  });
  const eventos = rule(
    { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
    "COMMITTEE",
    "a3",
  );

  it("segundo semestre: una ordinaria más la elección; la elección perdida no tiene reemplazo", () => {
    const result = computePerson(
      facts({ rules: [eventos], occasions: [ordinary, election, nextOrdinary] }),
      person({ committees: [committee("a3")], attended: new Set(["ord"]) }),
      NOW,
    );
    expect(result.mandatory).toMatchObject({
      required: { ordinary: 1, boardElection: true, runoff: false },
      attended: { ordinary: 1, boardElection: false },
      met: false,
      missing: ["BOARD_ELECTION"],
      lost: ["BOARD_ELECTION"],
    });
    expect(result.mandatory.upcoming.map((item) => item.occasionId)).toEqual(["ord-2"]);
  });

  it("una falta grave más otra sanción viva propone la expulsión (ADR-060 regla 6)", () => {
    const closedTerm = { ...TERM, permanenceClosedAt: new Date() };
    const termFacts = facts({
      rules: [eventos],
      occasions: [ordinary, election],
      term: closedTerm,
    });
    const warned = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["ord", "elec"]),
        expulsionWarning: true,
        credits: [{ ruleId: eventos.id, value: 60, reason: "" }],
      }),
      NOW,
    );
    expect(warned.expulsionWarning).toBe(true);
    expect(proposeDecisions(warned)).toEqual({
      committees: [{ committeeId: "a3", proposed: "CONTINUES", reason: 0 }],
      person: { proposed: "EXIT_OE", reason: 5 },
    });
    expect(tList("T-801")).toHaveLength(6);
  });

  it("faltar a una obligatoria manda sobre las sanciones, y las sanciones sobre quedarse sin comité", () => {
    const closedTerm = { ...TERM, permanenceClosedAt: new Date() };
    const termFacts = facts({
      rules: [eventos],
      occasions: [ordinary, election],
      term: closedTerm,
    });
    const warnedAndAbsent = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["ord"]),
        expulsionWarning: true,
        credits: [{ ruleId: eventos.id, value: 60, reason: "" }],
      }),
      NOW,
    );
    expect(warnedAndAbsent.mandatory.lost).toEqual(["BOARD_ELECTION"]);
    expect(proposeDecisions(warnedAndAbsent).person).toEqual({ proposed: "EXIT_OE", reason: 4 });
    const warnedWithoutCommittee = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["ord", "elec"]),
        expulsionWarning: true,
        credits: [{ ruleId: eventos.id, value: 10, reason: "" }],
      }),
      NOW,
    );
    expect(proposeDecisions(warnedWithoutCommittee)).toEqual({
      committees: [{ committeeId: "a3", proposed: "EXIT_COMMITTEE", reason: 2 }],
      person: { proposed: "EXIT_OE", reason: 5 },
    });
  });

  describe("el motivo automático de una decisión ya confirmada (ADR-128 regla 1)", () => {
    const closedTerm = { ...TERM, permanenceClosedAt: new Date() };
    const termFacts = facts({
      rules: [eventos],
      occasions: [ordinary, election],
      term: closedTerm,
    });
    const resultOf = (attended: string[], credit: number, expulsionWarning = false) =>
      computePerson(
        termFacts,
        person({
          committees: [committee("a3")],
          attended: new Set(attended),
          expulsionWarning,
          credits: [{ ruleId: eventos.id, value: credit, reason: "" }],
        }),
        NOW,
      );
    const stays = resultOf(["ord", "elec"], 60);
    const withoutCommittee = resultOf(["ord", "elec"], 10);
    const absent = resultOf(["ord"], 60);
    const warned = resultOf(["ord", "elec"], 60, true);
    const exits = [withoutCommittee, absent, warned];
    const KINDS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE", "EXIT_OE"] as const;
    const REASONS = [0, 1, 2, 3, 4, 5] as const;
    type Result = ReturnType<typeof resultOf>;

    /**
     * Lo que mostraba la pestaña de la Persona 360 antes del ciclo 16 (`TabPermanencia.tsx` en
     * `refactor/ciclo-15`): la posición de lo propuesto en su lista y, para la salida de la OE, el 3 o
     * el 4 según `mandatory.met`.
     */
    const shownBeforeCycle16 = (result: Result, proposed: (typeof KINDS)[number]) =>
      proposed === "EXIT_OE" ? (result.mandatory.met ? 3 : 4) : KINDS.indexOf(proposed);

    /**
     * Cada situación que el cierre distingue al proponerle a una persona: perdió o no una obligatoria,
     * la expulsan o no sus sanciones, le queda o no un comité, y lo obligatorio cumplido o no. Con una
     * perdida lo obligatorio no está cumplido; sin ninguna puede no estarlo igual, que es el nuevo con
     * la inducción pendiente o la obligatoria que no se da por perdida. Son doce.
     */
    const situations: Array<{ name: string; result: Result }> = [];
    for (const lost of [false, true]) {
      for (const warnedNow of [false, true]) {
        for (const keepsCommittee of [true, false]) {
          for (const met of lost ? [false] : [true, false]) {
            situations.push({
              name: `${lost ? "perdió una obligatoria" : met ? "obligatorias cumplidas" : "obligatorias sin cumplir y ninguna perdida"}, ${warnedNow ? "con" : "sin"} advertencia de expulsión, ${keepsCommittee ? "con" : "sin"} comité`,
              result: {
                ...stays,
                expulsionWarning: warnedNow,
                results: (keepsCommittee ? stays : withoutCommittee).results,
                mandatory: {
                  ...stays.mandatory,
                  met,
                  lost: lost ? absent.mandatory.lost : [],
                },
              },
            });
          }
        }
      }
    }

    it("con el motivo guardado es ese, diga lo que diga el resultado de hoy y sea cual sea la propuesta", () => {
      expect(situations).toHaveLength(12);
      for (const { name, result } of situations) {
        for (const proposed of KINDS) {
          expect(
            REASONS.map((saved) => proposalReason(saved, result, proposed)),
            `${name}: ${proposed}`,
          ).toEqual([...REASONS]);
        }
      }
    });

    it("sin motivo guardado, continuar, la prueba y la salida de un comité llevan el de su propuesta, y la salida de la OE que hoy se sigue proponiendo, su causa de hoy", () => {
      expect(exits.map((result) => proposalReason(null, result, "EXIT_OE"))).toEqual([3, 4, 5]);
      expect(exits.map((result) => proposalReason(null, result, "EXIT_OE"))).toEqual(
        exits.map((result) => proposeDecisions(result).person.reason),
      );
      // Lo llevan en la propuesta, diga lo que diga hoy el resultado.
      for (const result of [stays, ...exits]) {
        expect(
          (["CONTINUES", "PROBATION", "EXIT_COMMITTEE"] as const).map((proposed) =>
            proposalReason(null, result, proposed),
          ),
        ).toEqual([0, 1, 2]);
      }
    });

    it("sin motivo guardado, la salida de la OE que hoy ya no se propondría muestra lo que mostraba la pestaña de antes: el 3 con lo obligatorio cumplido y el 4 sin cumplir (respaldo de las filas viejas, DT-401)", () => {
      // Ni perdió una obligatoria ni lo expulsan sus sanciones, y comité le queda: hoy continuaría.
      expect(proposeDecisions(stays).person).toEqual({ proposed: "CONTINUES", reason: 0 });
      expect(stays.mandatory.met).toBe(true);
      expect(proposalReason(null, stays, "EXIT_OE")).toBe(3);
      // Lo mismo con lo obligatorio sin cumplir y nada perdido, como el nuevo con la inducción pendiente
      // al que le ajustaron el requisito después de confirmar su salida por una asamblea (DT-392).
      const pendingInduction = { ...stays, mandatory: { ...stays.mandatory, met: false } };
      expect(proposeDecisions(pendingInduction).person).toEqual({
        proposed: "CONTINUES",
        reason: 0,
      });
      expect(proposalReason(null, pendingInduction, "EXIT_OE")).toBe(4);
    });

    it("la causal de la baja y el motivo de la salida salen de una sola regla: en cada situación dicen lo que decían la condición que la baja escribía a mano y la función del motivo de antes del ciclo 17 (DT-398)", () => {
      /**
       * Las dos copias de antes, como estaban en `refactor/ciclo-16`: la condición de `applyDecisions`
       * (`closing.ts`), que leía el snapshot, y `exitReason` (`permanence-pure.ts`), con su 3 de
       * centinela de «nada obliga a salir».
       */
      const expelledBefore = (result: Result) =>
        result.mandatory.lost.length > 0 || result.expulsionWarning;
      const exitReasonBefore = (result: Result) => {
        if (result.mandatory.lost.length > 0) {
          return 4;
        }
        return result.expulsionWarning ? 5 : 3;
      };
      for (const { name, result } of situations) {
        const keeps = proposeDecisions(result).committees.some(
          (item) => item.proposed !== "EXIT_COMMITTEE",
        );
        const reason = exitReasonBefore(result);
        const personBefore =
          reason === 3 && keeps
            ? { proposed: "CONTINUES", reason: 0 }
            : { proposed: "EXIT_OE", reason };
        expect(proposeDecisions(result).person, name).toEqual(personBefore);
        expect(exitEndReason(result), name).toBe(
          expelledBefore(result) ? "EXPULSION" : "PERMANENCE",
        );
        // Una sola regla: la baja es una expulsión exactamente cuando el motivo de la salida es la
        // obligatoria perdida o las sanciones.
        expect(exitEndReason(result) === "EXPULSION", name).toBe(reason === 4 || reason === 5);
        // El respaldo de las filas viejas tampoco cambia.
        const fallback = result.mandatory.met ? 3 : 4;
        expect(proposalReason(null, result, "EXIT_OE"), name).toBe(
          personBefore.proposed === "EXIT_OE" ? reason : fallback,
        );
      }
      // Las doce situaciones, en su orden: sin nada que obligue, con la advertencia y con la perdida.
      expect(situations.map(({ result }) => exitEndReason(result))).toEqual([
        ...Array<string>(4).fill("PERMANENCE"),
        ...Array<string>(8).fill("EXPULSION"),
      ]);
      // La baja la lee del snapshot, que trae lo obligatorio y la advertencia igual que el resultado.
      expect(exitEndReason({ mandatory: absent.mandatory, expulsionWarning: false })).toBe(
        "EXPULSION",
      );
      expect(exitEndReason({ mandatory: stays.mandatory, expulsionWarning: true })).toBe(
        "EXPULSION",
      );
      expect(exitEndReason({ mandatory: stays.mandatory, expulsionWarning: false })).toBe(
        "PERMANENCE",
      );
    });

    it("de cada situación al confirmar a cada situación de hoy: con el motivo guardado se muestra el de la propuesta, y sin él lo que mostraba la pestaña de antes del ciclo 16, salvo donde hoy se sigue proponiendo lo decidido, que muestra el motivo de hoy", () => {
      let compared = 0;
      const unsavedAwayFromProposal: string[] = [];
      const beforeAwayFromProposal: string[] = [];
      for (const confirmed of situations) {
        const { proposed, reason: atConfirm } = proposeDecisions(confirmed.result).person;
        for (const today of situations) {
          const label = `${confirmed.name} → ${today.name}`;
          compared += 1;
          expect(proposalReason(atConfirm, today.result, proposed), label).toBe(atConfirm);

          const unsaved = proposalReason(null, today.result, proposed);
          const before = shownBeforeCycle16(today.result, proposed);
          const now = proposeDecisions(today.result).person;
          if (now.proposed === proposed) {
            expect(unsaved, label).toBe(now.reason);
          } else {
            expect(unsaved, label).toBe(before);
          }
          // Lo que el ticket pide de una fila vieja: no dice nada distinto de la pestaña de antes
          // salvo donde hoy se sigue proponiendo lo que se decidió.
          if (unsaved !== before) {
            expect(now.proposed, label).toBe(proposed);
          }
          if (unsaved !== atConfirm) {
            unsavedAwayFromProposal.push(label);
          }
          if (before !== atConfirm) {
            beforeAwayFromProposal.push(label);
          }
        }
      }
      expect(compared).toBe(144);
      // Sin el motivo guardado no hay de dónde sacar por qué se propuso cuando los hechos cambian: de
      // las 144 combinaciones, en 78 la fila vieja no muestra el motivo de su propuesta, y en 80 no lo
      // mostraba la pestaña de antes. Con el motivo guardado no hay ninguna. Es lo que deja el respaldo
      // (DT-401): los dos números lo fijan, para que nadie lo lea como una regla que acierta.
      expect(unsavedAwayFromProposal).toHaveLength(78);
      expect(beforeAwayFromProposal).toHaveLength(80);
    });
  });

  it("una obligatoria con excusa aceptada no se pierde ni expulsa (ADR-060 regla 5)", () => {
    const closedTerm = { ...TERM, permanenceClosedAt: new Date() };
    const termFacts = facts({
      rules: [eventos],
      occasions: [ordinary, election],
      term: closedTerm,
    });
    const excusedFromElection = person({
      committees: [committee("a3")],
      attended: new Set(["ord"]),
      excused: new Set(["elec"]),
      credits: [{ ruleId: eventos.id, value: 60, reason: "" }],
    });
    const result = computePerson(termFacts, excusedFromElection, NOW);
    expect(result.mandatory).toMatchObject({
      met: true,
      missing: [],
      lost: [],
      excused: ["BOARD_ELECTION"],
    });
    expect(proposeDecisions(result).person).toEqual({ proposed: "CONTINUES", reason: 0 });
    // Sin excusa, la elección perdida sí expulsa.
    const absent = computePerson(
      termFacts,
      person({ ...excusedFromElection, excused: new Set() }),
      NOW,
    );
    expect(absent.mandatory.lost).toEqual(["BOARD_ELECTION"]);
    expect(proposeDecisions(absent).person).toEqual({ proposed: "EXIT_OE", reason: 4 });
  });

  it("una obligatoria sin programar todavía no se da por perdida", () => {
    const result = computePerson(
      facts({ rules: [eventos], occasions: [ordinary] }),
      person({ committees: [committee("a3")], attended: new Set(["ord"]) }),
      NOW,
    );
    expect(result.mandatory).toMatchObject({ met: false, missing: ["BOARD_ELECTION"], lost: [] });
  });

  it("primer semestre: solo la ordinaria, y una futura la mantiene pendiente sin perderla", () => {
    const result = computePerson(
      facts({ rules: [eventos], occasions: [nextOrdinary], term: { ...TERM, semester: 1 } }),
      person({
        committees: [committee("a3")],
        assemblyRequirement: {
          requiredOrdinary: 1,
          requiresBoardElection: false,
          requiresRunoff: false,
        },
      }),
      NOW,
    );
    expect(result.mandatory).toMatchObject({ met: false, missing: ["ORDINARY"], lost: [] });
  });

  it("propone salir del comité, de la OE cuando no queda otro y por faltar a una obligatoria", () => {
    const pixel = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "pixel",
    );
    const closedTerm = { ...TERM, permanenceClosedAt: new Date() };
    const termFacts = facts({
      rules: [eventos, pixel],
      occasions: [ordinary, election],
      term: closedTerm,
    });
    const mixed = computePerson(
      termFacts,
      person({
        committees: [committee("a3"), committee("pixel")],
        attended: new Set(["ord", "elec"]),
        credits: [
          { ruleId: eventos.id, value: 30, reason: "" },
          { ruleId: pixel.id, value: 55, reason: "" },
        ],
      }),
      NOW,
    );
    expect(proposeDecisions(mixed)).toEqual({
      committees: [
        { committeeId: "a3", proposed: "EXIT_COMMITTEE", reason: 2 },
        { committeeId: "pixel", proposed: "PROBATION", reason: 1 },
      ],
      person: { proposed: "CONTINUES", reason: 0 },
    });
    const allOut = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["ord", "elec"]),
        credits: [{ ruleId: eventos.id, value: 10, reason: "" }],
      }),
      NOW,
    );
    expect(proposeDecisions(allOut).person).toEqual({ proposed: "EXIT_OE", reason: 3 });
    const missedAssembly = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        attended: new Set(["ord"]),
        credits: [{ ruleId: eventos.id, value: 60, reason: "" }],
      }),
      NOW,
    );
    expect(proposeDecisions(missedAssembly)).toMatchObject({
      committees: [{ committeeId: "a3", proposed: "CONTINUES", reason: 0 }],
      person: { proposed: "EXIT_OE", reason: 4 },
    });
  });

  it("un comité sin tabla vale su nominal como posible: nadie arranca en no alcanza", () => {
    const result = computePerson(
      facts({ rules: generalRules() }),
      person({ committees: [committee("pixel")] }),
      NOW,
    );
    const pixel = result.results[0];
    expect(pixel).toMatchObject({ committeeMax: 60, committeeTotal: 0, state: "EN_CAMINO" });
    const generalRemaining = result.general.reduce((acc, item) => acc + item.remaining, 0);
    expect(pixel?.remaining).toBe(round2(60 + generalRemaining));
    const noTables = computePerson(facts({ rules: [] }), person(), NOW);
    expect(noTables.generalMax).toBe(50);
    expect(noTables.results[0]).toMatchObject({ remaining: 110, state: "EN_CAMINO" });
  });

  it("quien está en licencia o sin comité no se evalúa", () => {
    const onLeave = computePerson(facts(), person({ status: "ON_LEAVE" }), NOW);
    expect(onLeave.evaluated).toBe(false);
    expect(onLeave.results).toEqual([]);
    const left = computePerson(
      facts(),
      person({ committees: [committee("pixel", { leftAt: past(1) })] }),
      NOW,
    );
    expect(left.evaluated).toBe(false);
  });
});

describe("ventana, avisos y distribución", () => {
  it("la ventana abre catorce días antes del fin del término y se cierra con la permanencia", () => {
    expect(evaluationWindow(TERM, CONFIG, NOW)).toEqual({ opensOn: "2026-11-21", open: false });
    expect(evaluationWindow(TERM, CONFIG, new Date("2026-11-21T10:00:00Z")).open).toBe(true);
    expect(
      evaluationWindow(
        { ...TERM, permanenceClosedAt: new Date() },
        CONFIG,
        new Date("2026-11-30T10:00:00Z"),
      ).open,
    ).toBe(false);
  });

  it("avisa a mitad de semestre, tres semanas antes si va por debajo, cuando no alcanza y antes de una obligatoria", () => {
    const eventos = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const soon = occ({
      id: "asm-soon",
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      startsAt: new Date(NOW.getTime() + 3_600_000),
    });
    const termFacts = facts({ rules: [eventos], occasions: [soon] });
    const mid = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        credits: [{ ruleId: eventos.id, value: 20, reason: "" }],
      }),
      NOW,
    );
    const midNotices = noticesFor(TERM, mid, CONFIG, NOW);
    expect(midNotices.map((item) => item.kind)).toEqual(["MID_TERM", "MANDATORY_ASSEMBLY"]);
    expect(midNotices[0]?.values).toMatchObject({ n: 20, umbral: 60, comité: "a3" });
    const early = new Date("2026-08-01T15:00:00Z");
    expect(
      noticesFor(
        TERM,
        computePerson(termFacts, person({ committees: [committee("a3")] }), early),
        CONFIG,
        early,
      ),
    ).toEqual([]);
    const late = new Date("2026-11-20T15:00:00Z");
    const below = computePerson(
      termFacts,
      person({
        committees: [committee("a3")],
        credits: [{ ruleId: eventos.id, value: 30, reason: "" }],
      }),
      late,
    );
    expect(noticesFor(TERM, below, CONFIG, late).map((item) => item.kind)).toEqual([
      "CLOSING_WARNING",
    ]);
    const closedFacts = facts({ rules: [eventos], occasions: [] });
    const hopeless = computePerson(
      closedFacts,
      person({
        committees: [committee("a3")],
        credits: [{ ruleId: eventos.id, value: 0, reason: "" }],
      }),
      late,
    );
    // Sin tabla general y con el manual abierto todo sigue posible: en camino. No alcanza exige una tasa sin reuniones futuras.
    expect(hopeless.results[0]?.state).toBe("EN_CAMINO");
    const reuniones = rule(
      { key: "reuniones", label: "Reuniones", weight: 60, computation: "CHECKIN_RATE", params: {} },
      "COMMITTEE",
      "a3",
    );
    const meetings = [1, 2].map((i) =>
      occ({ category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(i) }),
    );
    const noAlcanza = computePerson(
      facts({ rules: [reuniones], occasions: meetings }),
      person({ committees: [committee("a3")] }),
      NOW,
    );
    expect(noticesFor(TERM, noAlcanza, CONFIG, NOW).map((item) => item.kind)).toEqual([
      "NO_ALCANZA",
    ]);
    const evaluator = noticesFor(TERM, mid, CONFIG, NOW, {
      pendingEvaluations: 2,
      isEvaluator: true,
    });
    expect(evaluator.at(-1)).toMatchObject({
      kind: "EVALUATION_WINDOW_CLOSED",
      values: { fecha: "2026-11-21" },
    });
    const inWindow = new Date("2026-11-25T15:00:00Z");
    const pendingNotice = noticesFor(
      TERM,
      computePerson(termFacts, person(), inWindow),
      CONFIG,
      inWindow,
      { pendingEvaluations: 2, isEvaluator: true },
    );
    expect(pendingNotice.map((item) => item.kind)).toContain("EVALUATIONS_PENDING");
    // Recién abierta la ventana el aviso es "se abrió" (T-168); después, "pendientes" (T-188).
    const justOpened = new Date("2026-11-22T15:00:00Z");
    expect(
      noticesFor(TERM, computePerson(termFacts, person(), justOpened), CONFIG, justOpened, {
        pendingEvaluations: 2,
        isEvaluator: true,
      }).map((item) => item.kind),
    ).toContain("EVALUATION_WINDOW_OPENED");
  });

  // ADR-020: «hoy» es el día civil de Colombia. De 19:00 a 24:00 de Colombia el día de UTC ya es el
  // siguiente, así que cada caso fija las 7:30 p. m. de la víspera (00:30 UTC) y la medianoche (05:00 UTC).
  it("la ventana abre a la medianoche de Colombia, no la víspera por la noche", () => {
    const eveNight = new Date("2026-11-21T00:30:00Z");
    expect(evaluationWindow(TERM, CONFIG, eveNight)).toEqual({
      opensOn: "2026-11-21",
      open: false,
    });
    expect(evaluationWindow(TERM, CONFIG, new Date("2026-11-21T04:59:59Z")).open).toBe(false);
    expect(evaluationWindow(TERM, CONFIG, new Date("2026-11-21T05:00:00Z")).open).toBe(true);
    // El cálculo usa la misma ventana: la víspera por la noche un grupo todavía vale el peso completo.
    const gap = rule({
      key: "gap",
      label: "GAP",
      weight: 5,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED" },
    });
    const termFacts = facts({ rules: [gap], groups: [group("GAP", "gap-1")] });
    expect(computePerson(termFacts, person(), eveNight).general[0]?.remaining).toBe(5);
    expect(
      computePerson(termFacts, person(), new Date("2026-11-21T05:00:00Z")).general[0]?.remaining,
    ).toBe(0);
  });

  it("los avisos cambian con el día de Colombia, no con el de UTC", () => {
    const eventos = rule(
      { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
      "COMMITTEE",
      "a3",
    );
    const termFacts = facts({ rules: [eventos] });
    const below = person({
      committees: [committee("a3")],
      credits: [{ ruleId: eventos.id, value: 30, reason: "" }],
    });
    const kindsAt = (
      iso: string,
      context?: { pendingEvaluations: number; isEvaluator: boolean },
    ) => {
      const at = new Date(iso);
      return noticesFor(TERM, computePerson(termFacts, below, at), CONFIG, at, context).map(
        (item) => item.kind,
      );
    };
    // La mitad del semestre es el 23 de septiembre.
    expect(kindsAt("2026-09-23T00:30:00Z")).toEqual([]);
    expect(kindsAt("2026-09-23T05:00:00Z")).toEqual(["MID_TERM"]);
    // Tres semanas antes del cierre es el 14 de noviembre.
    expect(kindsAt("2026-11-14T00:30:00Z")).toEqual(["MID_TERM"]);
    expect(kindsAt("2026-11-14T05:00:00Z")).toEqual(["CLOSING_WARNING"]);
    // La ventana abre el 21 de noviembre: la víspera por la noche el evaluador aún ve que no ha abierto.
    const evaluator = { pendingEvaluations: 2, isEvaluator: true };
    expect(kindsAt("2026-11-21T00:30:00Z", evaluator)).toEqual([
      "CLOSING_WARNING",
      "EVALUATION_WINDOW_CLOSED",
    ]);
    expect(kindsAt("2026-11-21T05:00:00Z", evaluator)).toEqual([
      "CLOSING_WARNING",
      "EVALUATION_WINDOW_OPENED",
    ]);
    // «Se abrió» dura hasta el 24 de noviembre entero; «pendientes» empieza el 25.
    expect(kindsAt("2026-11-25T00:30:00Z", evaluator)).toEqual([
      "CLOSING_WARNING",
      "EVALUATION_WINDOW_OPENED",
    ]);
    expect(kindsAt("2026-11-25T05:00:00Z", evaluator)).toEqual([
      "CLOSING_WARNING",
      "EVALUATIONS_PENDING",
    ]);
  });

  it("tras aplicar el cierre avisa el resultado durante un mes y nada más", () => {
    const closedAt = new Date("2026-12-10T15:00:00Z");
    const closedTerm = { ...TERM, pointsClosedAt: closedAt, permanenceClosedAt: closedAt };
    const closedFacts = facts({ rules: generalRules(), term: closedTerm });
    const result = computePerson(closedFacts, person(), closedAt);
    const soon = new Date("2026-12-20T15:00:00Z");
    expect(
      noticesFor(closedTerm, result, CONFIG, soon, { pendingEvaluations: 3, isEvaluator: true }),
    ).toEqual([{ kind: "TERM_CLOSED", values: { término: "2026-2" } }]);
    const later = new Date("2027-02-01T15:00:00Z");
    expect(noticesFor(closedTerm, result, CONFIG, later)).toEqual([]);
  });

  it("resume la distribución de estados", () => {
    expect(
      distribution([
        { state: "EN_CAMINO", total: 70 },
        { state: "EN_RIESGO", total: 55 },
        { state: "NO_ALCANZA", total: 20 },
        { state: "CUMPLE", total: 75 },
      ]),
    ).toEqual({ people: 4, enCamino: 2, enRiesgo: 1, noAlcanza: 1, average: 55 });
    expect(distribution([])).toEqual({
      people: 0,
      enCamino: 0,
      enRiesgo: 0,
      noAlcanza: 0,
      average: 0,
    });
  });
});

describe("segunda vuelta de la elección de junta (ADR-028, ADR-060 regla 3)", () => {
  const eventos = rule(
    { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
    "COMMITTEE",
    "a3",
  );
  const ordinary = occ({
    id: "ord-sv",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    startsAt: past(40),
  });
  const election = occ({
    id: "elec-sv",
    kind: "ASSEMBLY",
    assemblyKind: "BOARD_ELECTION",
    startsAt: past(20),
  });
  const runoff = occ({ id: "sv", kind: "ASSEMBLY", assemblyKind: "RUNOFF", startsAt: past(5) });
  /** Quien debe la segunda vuelta y ya fue a la ordinaria y a la elección. */
  const voter = (overrides: Partial<PersonFacts> = {}) =>
    person({
      committees: [committee("a3")],
      attended: new Set(["ord-sv", "elec-sv"]),
      credits: [{ ruleId: eventos.id, value: 60, reason: "" }],
      assemblyRequirement: {
        requiredOrdinary: 1,
        requiresBoardElection: true,
        requiresRunoff: true,
      },
      ...overrides,
    });
  const mandatoryOf = (occasions: OccasionFact[], who: PersonFacts) =>
    computePerson(facts({ rules: [eventos], occasions }), who, NOW);

  it("quien la debía y no fue la pierde: el cierre propone la salida de la OE", () => {
    const result = mandatoryOf([ordinary, election, runoff], voter());
    expect(result.mandatory).toMatchObject({
      required: { ordinary: 1, boardElection: true, runoff: true },
      attended: { ordinary: 1, boardElection: true, runoff: false },
      met: false,
      missing: ["RUNOFF"],
      lost: ["RUNOFF"],
      excused: [],
    });
    expect(proposeDecisions(result).person).toEqual({ proposed: "EXIT_OE", reason: 4 });
  });

  it("quien fue la cumple", () => {
    const result = mandatoryOf(
      [ordinary, election, runoff],
      voter({ attended: new Set(["ord-sv", "elec-sv", "sv"]) }),
    );
    expect(result.mandatory).toMatchObject({
      attended: { runoff: true },
      met: true,
      missing: [],
      lost: [],
    });
    expect(proposeDecisions(result).person).toEqual({ proposed: "CONTINUES", reason: 0 });
  });

  it("con excusa aceptada no falta ni se pierde (ADR-060 regla 5)", () => {
    const result = mandatoryOf([ordinary, election, runoff], voter({ excused: new Set(["sv"]) }));
    expect(result.mandatory).toMatchObject({
      attended: { runoff: false },
      met: true,
      missing: [],
      lost: [],
      excused: ["RUNOFF"],
    });
    expect(proposeDecisions(result).person.proposed).toBe("CONTINUES");
  });

  it("con otra segunda vuelta programada falta, pero todavía no se pierde", () => {
    const replacement = occ({
      id: "sv-2",
      kind: "ASSEMBLY",
      assemblyKind: "RUNOFF",
      startsAt: future(7),
    });
    const result = mandatoryOf([ordinary, election, runoff, replacement], voter());
    expect(result.mandatory).toMatchObject({ met: false, missing: ["RUNOFF"], lost: [] });
    expect(result.mandatory.upcoming.map((item) => item.occasionId)).toEqual(["sv-2"]);
    expect(proposeDecisions(result).person.proposed).toBe("CONTINUES");
  });

  it("una segunda vuelta que nunca se cargó falta, pero no expulsa a nadie", () => {
    const result = mandatoryOf([ordinary, election], voter());
    expect(result.mandatory).toMatchObject({ met: false, missing: ["RUNOFF"], lost: [] });
  });

  it("una segunda vuelta cancelada no cuenta como celebrada", () => {
    const cancelled = { ...runoff, status: "CANCELLED" as const };
    const result = mandatoryOf([ordinary, election, cancelled], voter());
    expect(result.mandatory).toMatchObject({ missing: ["RUNOFF"], lost: [] });
  });

  it("a quien no se le exige no le falta aunque no haya ido", () => {
    const result = mandatoryOf(
      [ordinary, election, runoff],
      voter({
        assemblyRequirement: {
          requiredOrdinary: 1,
          requiresBoardElection: true,
          requiresRunoff: false,
        },
      }),
    );
    expect(result.mandatory).toMatchObject({
      required: { runoff: false },
      met: true,
      missing: [],
      lost: [],
    });
  });

  // Decisión abierta 23, primera pregunta: ¿una ocasión en borrador con fecha pasada cuenta como
  // celebrada? Hoy sí (ADR-036 regla 4 dice «no canceladas con fecha pasada»). Esta prueba fija la
  // conducta de hoy, no la decide: una segunda vuelta en borrador propone la salida de quien la debía.
  it("una segunda vuelta en borrador con fecha pasada cuenta como celebrada (decisión abierta 23)", () => {
    const draft = { ...runoff, status: "DRAFT" as const };
    const result = mandatoryOf([ordinary, election, draft], voter());
    expect(result.mandatory).toMatchObject({ missing: ["RUNOFF"], lost: ["RUNOFF"] });
    expect(proposeDecisions(result).person).toEqual({ proposed: "EXIT_OE", reason: 4 });
  });
});

describe("tasa de reuniones: borradores y ninguna exigible (decisión abierta 23)", () => {
  const reuniones = rule(
    {
      key: "reuniones",
      label: "Reuniones",
      weight: 15,
      computation: "CHECKIN_RATE",
      params: { category: "COMMITTEE_MEETING" },
    },
    "COMMITTEE",
    "a3",
  );
  const meeting = (id: string, overrides: Partial<OccasionFact> = {}) =>
    occ({ id, category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(7), ...overrides });
  const rateOf = (occasions: OccasionFact[], who: PersonFacts, term: TermFacts["term"] = TERM) =>
    computePerson(facts({ rules: [reuniones], occasions, term }), who, NOW).results[0]?.criteria[0];

  // Decisión abierta 23, primera pregunta: ¿una ocasión en borrador con fecha pasada cuenta como
  // celebrada? Hoy sí: entra al denominador y le baja la tasa a todo el comité. Esta prueba fija la
  // conducta de hoy, no la decide.
  it("una reunión en borrador con fecha pasada cuenta como celebrada y baja la tasa (decisión abierta 23)", () => {
    const criterion = rateOf(
      [meeting("r1"), meeting("r2", { status: "DRAFT", startsAt: past(3) })],
      person({ committees: [committee("a3")], attended: new Set(["r1"]) }),
    );
    expect(criterion).toMatchObject({
      achieved: 7.5,
      detail: { type: "CHECKIN_RATE", attended: 1, held: 2, rate: 0.5 },
    });
  });

  // Decisión abierta 23, segunda pregunta: ¿cuánto vale la tasa cuando la persona no tiene ninguna
  // reunión exigible? Hoy vale cero, igual que faltar a todas. Esta prueba fija la conducta de hoy, no
  // la decide: con el término abierto el peso sigue siendo posible, y al cerrar queda en cero.
  it("sin ninguna reunión exigible la tasa vale 0 (decisión abierta 23)", () => {
    const excusedOnly = person({ committees: [committee("a3")], excused: new Set(["r1"]) });
    expect(rateOf([meeting("r1")], excusedOnly)).toMatchObject({
      achieved: 0,
      remaining: 15,
      detail: { type: "CHECKIN_RATE", attended: 0, held: 0, future: 0, rate: 0 },
    });
    // Quien entró al comité después de la última reunión tampoco tiene ninguna exigible.
    const joinedLate = person({ committees: [committee("a3", { joinedAt: past(1) })] });
    expect(rateOf([meeting("r1")], joinedLate)).toMatchObject({
      achieved: 0,
      detail: { type: "CHECKIN_RATE", held: 0, rate: 0 },
    });
    const closedTerm = { ...TERM, permanenceClosedAt: NOW };
    expect(rateOf([meeting("r1")], excusedOnly, closedTerm)).toMatchObject({
      achieved: 0,
      remaining: 0,
      detail: { type: "CHECKIN_RATE", held: 0, rate: 0 },
    });
  });
});

describe("tasa de reuniones en la tabla general", () => {
  // Caracterización (DT-156): la tasa se mide contra la pertenencia al comité de la regla. Una regla de
  // la tabla general no tiene comité, así que no encuentra pertenencia ni reuniones exigibles: hoy vale
  // 0 para todos y, con el término abierto, deja su peso entero como posible.
  it("no encuentra pertenencia contra la que medirse y vale 0", () => {
    const general = rule({
      key: "reuniones-general",
      label: "Reuniones",
      weight: 10,
      computation: "CHECKIN_RATE",
      params: { category: "COMMITTEE_MEETING" },
    });
    const occasions = [
      occ({ id: "g1", category: "COMMITTEE_MEETING", committeeId: "a3", startsAt: past(7) }),
      occ({ id: "g2", category: "COMMITTEE_MEETING", startsAt: past(3) }),
    ];
    const result = computePerson(
      facts({ rules: [general], occasions }),
      person({ committees: [committee("a3")], attended: new Set(["g1", "g2"]) }),
      NOW,
    );
    expect(result.general[0]).toMatchObject({
      achieved: 0,
      remaining: 10,
      detail: { type: "CHECKIN_RATE", attended: 0, held: 0, future: 0, rate: 0 },
    });
  });
});

describe("lo que queda al congelar (ADR-116 regla 6)", () => {
  const eventos = rule(
    { key: "eventos", label: "Eventos", weight: 60, computation: "MANUAL", params: {} },
    "COMMITTEE",
    "a3",
  );

  it("el estado pasa a ser el final, no queda nada posible y el margen se mide sobre lo logrado", () => {
    const open = computePerson(
      facts({ rules: [eventos], occasions: [] }),
      person({
        committees: [committee("a3")],
        credits: [{ ruleId: eventos.id, value: 45, reason: "" }],
      }),
      NOW,
    );
    // Abierto: 45 logrados y 15 posibles en el comité, más el nominal de la tabla general sin cargar.
    expect(open.results[0]).toMatchObject({
      total: 45,
      remaining: 65,
      state: "EN_CAMINO",
      finalState: "PRUEBA",
    });

    const frozen = closedResults(open);

    expect(frozen.results[0]).toMatchObject({
      total: 45,
      threshold: 60,
      remaining: 0,
      margin: -15,
      state: "PRUEBA",
      finalState: "PRUEBA",
    });
    expect(frozen.results[0]?.criteria[0]).toMatchObject({ achieved: 45, remaining: 0 });
    // Lo abierto no se toca: congelar devuelve un resultado nuevo.
    expect(open.results[0]).toMatchObject({ remaining: 65, state: "EN_CAMINO" });
    expect(open.results[0]?.criteria[0]?.remaining).toBe(15);
  });

  it("da lo mismo que calcular con el término cerrado en el mismo instante, con las tablas de referencia", () => {
    const rules = [...generalRules(), ...committeeRules("pixel")];
    const occasions = [
      occ({ id: "f-ord", kind: "ASSEMBLY", assemblyKind: "ORDINARY", startsAt: past(30) }),
      occ({ id: "f-r1", category: "COMMITTEE_MEETING", committeeId: "pixel", startsAt: past(21) }),
      occ({ id: "f-r2", category: "COMMITTEE_MEETING", committeeId: "pixel", startsAt: past(7) }),
      occ({ id: "f-r3", category: "COMMITTEE_MEETING", committeeId: "pixel", startsAt: future(7) }),
      occ({ id: "f-int", category: "INTEGRATION", startsAt: past(10) }),
      occ({ id: "f-int-2", category: "INTEGRATION", startsAt: future(10) }),
    ];
    const groups = [group("GT_MACROEVENT", "gt-dias"), group("GAP_OE", "gap-oe")];
    const who = person({
      attended: new Set(["f-ord", "f-r1", "f-int"]),
      groupMemberships: [
        {
          groupId: "gt-dias",
          evaluation: "GOOD",
          leftAt: null,
          evaluatedById: "gh-director",
          evaluatedAt: NOW,
          note: null,
        },
        {
          groupId: "gap-oe",
          evaluation: "PENDING",
          leftAt: null,
          evaluatedById: null,
          evaluatedAt: null,
          note: null,
        },
      ],
    });
    const open = computePerson(facts({ rules, occasions, groups }), who, NOW);
    const closed = computePerson(
      facts({ rules, occasions, groups, term: { ...TERM, permanenceClosedAt: NOW } }),
      who,
      NOW,
    );
    // El caso tiene de qué: abierto queda algo posible en la tabla general y en la del comité.
    expect(open.general.some((criterion) => criterion.remaining > 0)).toBe(true);
    expect(open.results[0]?.criteria.some((criterion) => criterion.remaining > 0)).toBe(true);

    expect(closedResults(open)).toEqual({ general: closed.general, results: closed.results });
  });
});

describe("estado, nuevo y prueba de la persona según su roster (ADR-036 regla 5)", () => {
  const row = (overrides: Partial<Parameters<typeof personStanding>[0][number]> = {}) => ({
    status: "ACTIVE" as const,
    isNew: false,
    probation: false,
    ...overrides,
  });

  // Quién es nuevo lo decide `people` (`isNewMemberInTerm`, con su prueba en new-member-pure.test.ts)
  // y llega en el roster: acá solo se toma.
  it("nuevo es quien el roster dice que es nuevo", () => {
    expect(personStanding([row({ isNew: true })])).toEqual({
      status: "ACTIVE",
      isNew: true,
      probation: false,
    });
    expect(personStanding([row()])).toEqual({
      status: "ACTIVE",
      isNew: false,
      probation: false,
    });
  });

  it("sin filas en el roster no es miembro vigente: inactiva, ni nueva ni en prueba", () => {
    expect(personStanding([])).toEqual({
      status: "INACTIVE",
      isNew: false,
      probation: false,
    });
  });

  it("el estado, la condición de nuevo y la prueba son los de la persona y salen de su primera fila", () => {
    expect(
      personStanding([
        row({ status: "ON_LEAVE", isNew: true, probation: true }),
        row({ status: "ON_LEAVE", isNew: true, probation: true }),
      ]),
    ).toEqual({ status: "ON_LEAVE", isNew: true, probation: true });
  });
});
