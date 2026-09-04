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
  computePerson,
  conditionFor,
  deviatesFromNominal,
  distribution,
  evaluationWindow,
  finalStateFor,
  type GroupFact,
  noticesFor,
  type OccasionFact,
  type PermanenceConfig,
  type PersonFacts,
  proposeDecisions,
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

// Cálculo de permanencia (10-verificacion, unit): las tablas de referencia de 2026-2 reproducen las
// hojas de GH criterio por criterio, con el ejemplo de Pixel 75 % y Cigma 95 %.

const CONFIG: PermanenceConfig = {
  thresholds: { active: 60, new: 80, probation: 80, transfer: 70 },
  probationMargin: 10,
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

describe("condición y umbral (ADR-027)", () => {
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

  it("cerrado: cumple, prueba hasta 10 por debajo y no cumple más abajo", () => {
    expect(finalStateFor(60, 60, 10)).toBe("CUMPLE");
    expect(finalStateFor(50, 60, 10)).toBe("PRUEBA");
    expect(finalStateFor(49.99, 60, 10)).toBe("NO_CUMPLE");
    expect(stateFor(75, 100, 80, 10, true)).toBe("PRUEBA");
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
    // El crédito de 65 se acota al peso (60): en la transferencia falta para 70, en el otro comité cumple.
    expect(a3).toMatchObject({
      condition: "TRANSFER",
      threshold: 70,
      total: 60,
      finalState: "PRUEBA",
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
          { ruleId: eventos.id, value: 40, reason: "" },
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
    // El manual sigue pudiendo subir hasta el cierre: margen 0, en riesgo. No alcanza exige una tasa sin reuniones futuras.
    expect(hopeless.results[0]?.state).toBe("EN_RIESGO");
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
