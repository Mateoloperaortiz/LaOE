import type { CommitteeResult, CriterionResult } from "@/modules/permanence";

// La ruta de permanencia de Mi OE (plan maestro §7, ola 2): cada criterio de un comité es una parada
// con su estado, y la meta es el umbral. Lógica pura, para probarla sin pantalla.

export const STOP_STATES = ["done", "progress", "todo", "closed"] as const;
export type StopState = (typeof STOP_STATES)[number];

/** Margen para comparar puntos con decimales sin que un redondeo cambie el estado. */
const EPSILON = 0.005;

/**
 * El estado de una parada: lograda si ya sumó todo su peso; cerrada si no lo sumó y ya no queda nada
 * por sumar; en camino si lleva algo; por hacer si no lleva nada y todavía se puede.
 */
export function stopState(
  criterion: Pick<CriterionResult, "achieved" | "weight" | "remaining">,
): StopState {
  if (criterion.achieved + EPSILON >= criterion.weight) return "done";
  if (criterion.remaining <= EPSILON) return "closed";
  return criterion.achieved > EPSILON ? "progress" : "todo";
}

export interface RouteStop {
  key: string;
  label: string;
  state: StopState;
  achieved: number;
  weight: number;
}

/** Las paradas de un comité, en el orden de sus criterios, sin los que no pesan. */
export function routeStops(result: Pick<CommitteeResult, "criteria">): RouteStop[] {
  return result.criteria
    .filter((criterion) => criterion.weight > 0)
    .map((criterion) => ({
      key: criterion.ruleId,
      label: criterion.label,
      state: stopState(criterion),
      achieved: Math.round(criterion.achieved * 10) / 10,
      weight: Math.round(criterion.weight * 10) / 10,
    }));
}
