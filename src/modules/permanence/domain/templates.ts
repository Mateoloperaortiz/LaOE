import { tList } from "@/shared/copy";
import type { RuleInput } from "./params";

// Tablas de referencia (12-permanencia, transcritas de las hojas de GH y del comité A3, ADR-036 regla 3):
// GH las carga en un término con un botón y las ajusta. Los eventos 1 y 2 de A3 no se cargan
// porque todavía no tienen peso. Las esperadas (10 integraciones, 3 partidos) las dijo GH.

function labels(code: "T-125" | "T-841"): string[] {
  return tList(code);
}

/** La tabla general de 2026-2: veteranos suman 50 y nuevos 45 (con tres GT, el máximo de veteranos). */
export function referenceGeneralRules(assembliesForCredit: number): RuleInput[] {
  const names = labels("T-125");
  const keys = tList("T-842");
  const label = (index: number) => names[index] ?? keys[index] ?? `criterio-${index}`;
  const key = (index: number) => keys[index] ?? `criterio-${index}`;
  return [
    {
      key: key(0),
      label: label(0),
      description: "",
      weight: 10,
      appliesTo: "ALL",
      computation: "CHECKIN_COUNT",
      params: {
        category: "INTEGRATION",
        newMembersOnly: "EXCLUDE",
        committee: "ANY",
        perUnit: 2,
        expectedCount: 10,
      },
      sortOrder: 0,
    },
    {
      key: key(1),
      label: label(1),
      description: "",
      weight: 10,
      appliesTo: "ALL",
      computation: "CHECKIN_THRESHOLD",
      params: {
        kind: "ASSEMBLY",
        committee: "ANY",
        newMembersOnly: "ANY",
        minCount: assembliesForCredit,
      },
      sortOrder: 1,
    },
    {
      key: key(2),
      label: label(2),
      description: "",
      weight: 8,
      appliesTo: "VETERAN",
      computation: "GROUP_EVALUATED",
      params: {
        groupKind: "GT_MACROEVENT",
        mode: "TIERS",
        tiers: [
          { count: 1, value: 4 },
          { count: 2, value: 6 },
          { count: 3, value: 8 },
        ],
      },
      sortOrder: 2,
    },
    {
      key: key(3),
      label: label(3),
      description: "",
      weight: 5,
      appliesTo: "ALL",
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP", mode: "FIXED" },
      sortOrder: 3,
    },
    {
      key: key(4),
      label: label(4),
      description: "",
      weight: 6,
      appliesTo: "VETERAN",
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP_OE", mode: "PER_GROUP", perGroup: 3 },
      sortOrder: 4,
    },
    {
      key: key(5),
      label: label(5),
      description: "",
      weight: 6,
      appliesTo: "VETERAN",
      computation: "GROUP_EVALUATED",
      params: { groupKind: "WORK_COMMITTEE", mode: "FIXED" },
      sortOrder: 5,
    },
    {
      key: key(6),
      label: label(6),
      description: "",
      weight: 5,
      appliesTo: "ALL",
      computation: "COMPOSITE",
      params: {
        checkIns: {
          category: "ATHLETIC_MATCH",
          committee: "ANY",
          newMembersOnly: "ANY",
          minCount: 3,
          expectedCount: 3,
        },
        group: { groupKind: "BARRA_BRAVA" },
      },
      sortOrder: 6,
    },
    {
      key: key(7),
      label: label(7),
      description: "",
      weight: 10,
      appliesTo: "NEW",
      computation: "GROUP_EVALUATED",
      params: { groupKind: "NEW_MEMBER_TASK", mode: "FIXED" },
      sortOrder: 7,
    },
    {
      key: key(8),
      label: label(8),
      description: "",
      weight: 5,
      appliesTo: "NEW",
      computation: "CHECKIN_COUNT",
      params: {
        category: "INTEGRATION",
        newMembersOnly: "ONLY",
        committee: "ANY",
        perUnit: 5,
        expectedCount: 1,
      },
      sortOrder: 8,
    },
  ];
}

/** La tabla del comité A3: reuniones (tasa), puntaje del líder y convivencia obligatoria; suma 30. */
export function referenceCommitteeRules(): RuleInput[] {
  const names = labels("T-841");
  return [
    {
      key: "reuniones",
      label: names[0] ?? "reuniones",
      description: "",
      weight: 15,
      appliesTo: "ALL",
      computation: "CHECKIN_RATE",
      params: { category: "COMMITTEE_MEETING", committee: "OWN" },
      sortOrder: 0,
    },
    {
      key: "subcomite-liderazgo-destacado",
      label: names[1] ?? "subcomite-liderazgo-destacado",
      description: "",
      weight: 10,
      appliesTo: "ALL",
      computation: "LEADER_SCORE",
      params: { mandatory: false },
      sortOrder: 1,
    },
    {
      key: "convivencia",
      label: names[2] ?? "convivencia",
      description: "",
      weight: 5,
      appliesTo: "ALL",
      computation: "LEADER_SCORE",
      params: { mandatory: true },
      sortOrder: 2,
    },
  ];
}
