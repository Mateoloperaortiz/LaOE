import { dateKeyIn } from "@/shared/lib/dates-pure";

/** El momento del titular de la portada (ADR-189 regla 3). */
export type PortadaMomento =
  | { tipo: "convocatoria" }
  | { tipo: "evento"; dias: number }
  | { tipo: "semestre" };

/** Hasta cuántos días antes de una edición el titular de la portada es la edición. */
export const DIAS_SEMANA_DE_EVENTO = 7;

/** Días civiles, en la zona de la app, entre hoy y un instante: 0 es hoy y un negativo ya pasó. */
export function diasHasta(instante: Date, now: Date, timeZone: string): number {
  const dia = (fecha: Date) => Date.parse(`${dateKeyIn(timeZone, fecha)}T00:00:00Z`);
  return Math.round((dia(instante) - dia(now)) / 86_400_000);
}

// La convocatoria manda: la edición sigue en «Próximo encuentro», debajo del titular.
export function portadaMomento(input: {
  admisionAbierta: boolean;
  proximoInicio: Date | null;
  now: Date;
  timeZone: string;
}): PortadaMomento {
  if (input.admisionAbierta) {
    return { tipo: "convocatoria" };
  }
  if (input.proximoInicio) {
    const dias = diasHasta(input.proximoInicio, input.now, input.timeZone);
    if (dias >= 0 && dias <= DIAS_SEMANA_DE_EVENTO) {
      return { tipo: "evento", dias };
    }
  }
  return { tipo: "semestre" };
}
