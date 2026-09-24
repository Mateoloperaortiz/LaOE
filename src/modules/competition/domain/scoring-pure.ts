// Puntos de The Games sin I/O (ADR-089 regla 6): el navegador manda el desenlace y el servidor
// calcula los puntos según el tipo de base. No son GH Points ni tocan `point_entry`.

export const BASE_KINDS = ["NORMAL", "MACRO"] as const;
export type BaseKind = (typeof BASE_KINDS)[number];

export const OUTCOMES = ["A_WIN", "B_WIN", "DRAW"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Confirmado por la OE el 2026-09-23: las bases de inflables son macro. */
export const POINTS: Record<BaseKind, { win: number; draw: number; loss: number }> = {
  NORMAL: { win: 1000, draw: 500, loss: 0 },
  MACRO: { win: 2000, draw: 1000, loss: 0 },
};

/** Los puntos de cada lado de un enfrentamiento. */
export function pointsFor(kind: BaseKind, outcome: Outcome): { a: number; b: number } {
  const table = POINTS[kind];
  if (outcome === "A_WIN") return { a: table.win, b: table.loss };
  if (outcome === "B_WIN") return { a: table.loss, b: table.win };
  return { a: table.draw, b: table.draw };
}

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === "string" && (OUTCOMES as readonly string[]).includes(value);
}

/** Lo que hay que insertar para que el total de un equipo en una competencia extra quede en
 *  `target`: repetir la orden no suma dos veces (ADR-089 regla 7). */
export function extraDelta(current: number, target: number): number {
  return target - current;
}
