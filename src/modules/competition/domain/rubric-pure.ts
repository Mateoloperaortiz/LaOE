// Rúbrica de una competencia extra de The Games, sin I/O (ADR-089 regla 7). Cada criterio se califica
// del 1 al 10 y pesa un porcentaje; el total ponderado se lleva a 100 aunque los pesos no sumen 100, y
// los puntos de la competencia son el total por la escala (× 10 en The Challenge: hasta 1000).

export const RUBRIC_MIN_SCORE = 1;
export const RUBRIC_MAX_SCORE = 10;

export interface RubricCriterion {
  name: string;
  /** Peso en porcentaje. */
  weight: number;
}

/**
 * La rúbrica de The Challenge (competencia de talentos del jueves en la mañana) que entregó la OE el
 * 2026-09-24. Los pesos son los de la hoja Instrucciones y suman 85: Mateo decidió llevar el total a
 * 100 y convertirlo en puntos multiplicando por 10.
 */
export const THE_CHALLENGE_RUBRIC: { criteria: readonly RubricCriterion[]; scale: number } = {
  criteria: [
    { name: "Impacto y originalidad", weight: 20 },
    { name: "Integración del equipo", weight: 20 },
    { name: "Estructura y coherencia", weight: 20 },
    { name: "Producción y ambientación", weight: 15 },
    { name: "Cumplimiento de normas", weight: 10 },
  ],
  scale: 10,
};

export const RUBRIC_LEVELS = ["EXCELLENT", "GOOD", "FAIR", "TO_IMPROVE"] as const;
export type RubricLevel = (typeof RUBRIC_LEVELS)[number];

/** El total de 0 a 100, o `null` si falta calificar algún criterio. `scores[i]` es del criterio i. */
export function rubricTotal(
  criteria: readonly Pick<RubricCriterion, "weight">[],
  scores: ReadonlyArray<number | null | undefined>,
): number | null {
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (criteria.length === 0 || totalWeight <= 0) return null;
  let weighted = 0;
  for (const [index, criterion] of criteria.entries()) {
    const score = scores[index];
    if (score === null || score === undefined) return null;
    if (!Number.isInteger(score) || score < RUBRIC_MIN_SCORE || score > RUBRIC_MAX_SCORE) {
      throw new RangeError(`Calificación fuera de rango: ${score}`);
    }
    weighted += score * criterion.weight;
  }
  return (weighted * 100) / (RUBRIC_MAX_SCORE * totalWeight);
}

/** Los puntos de la competencia: el total por la escala, redondeado. */
export function rubricPoints(total: number, scale: number): number {
  return Math.round(total * scale);
}

/** El nivel, con los cortes de la hoja Consolidado de la OE: 85, 65 y 45. Es informativo. */
export function rubricLevel(total: number): RubricLevel {
  if (total >= 85) return "EXCELLENT";
  if (total >= 65) return "GOOD";
  if (total >= 45) return "FAIR";
  return "TO_IMPROVE";
}
