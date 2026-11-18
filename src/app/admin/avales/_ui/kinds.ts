// Los tipos de aval de la junta en el orden de T-5084 (ADR-195). Cada tramo suma el suyo.
export const AVAL_KINDS = [
  "EVENT",
  "SANCTION",
  "CANDIDACY",
  "TRANSFER",
  "EXTRAORDINARY",
  "PURCHASE",
  "CONTRACT",
  "CREATIVE",
] as const;
const params = {
  EVENT: "aval",
  SANCTION: "falta",
  CANDIDACY: "postulacion",
  TRANSFER: "finanzas",
  EXTRAORDINARY: "finanzas",
  PURCHASE: "finanzas",
  CONTRACT: "contrato",
  CREATIVE: "pieza",
} as const;
export function avalParam(kind: (typeof AVAL_KINDS)[number]) {
  return params[kind];
}
