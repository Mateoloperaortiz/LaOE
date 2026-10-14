import { scopeId } from "@/shared/lib/scope-id";

/** La ficha desde la que se opera sobre una nota o una tarea: la de su persona (ADR-122 regla 1). */
export interface PersonScope {
  personId: string;
}

/**
 * La persona de la ficha, o `null` si el alcance no la trae o no se reconoce. Quien llama falla
 * cerrado con eso: sin ficha no hay nota ni tarea que tocar.
 */
export function scopedPersonId(scope: PersonScope): string | null {
  return scopeId(scope, "personId");
}
