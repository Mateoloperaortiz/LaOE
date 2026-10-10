// Quién es nuevo en un término para la permanencia y para la guarda de cargos (sin I/O).

/** Lo que la regla mira: el término de ingreso de la membresía y las dos marcas de la fila general del término. */
export interface NewMemberFacts {
  /** Término en que ingresó a la OE; `null` si no tiene membresía. */
  firstTermId: string | null;
  /** Volvió a la OE y retoma este término como nuevo. */
  resumedNew: boolean;
  /** GH lo reporta como activo aunque sea su primer término: la mesa de un comité nuevo (Est. art. 5 par. 1). */
  reportAsVeteran: boolean;
}

/**
 * Nuevo en el término es quien ingresó en él o retoma como nuevo, salvo que GH lo reporte como activo
 * (ADR-060 reglas 8 y 11). Es la única definición para la permanencia (la condición y el umbral con
 * que se le mide) y para la guarda de cargos (un nuevo no recibe cargo de mesa sin aval): la primera
 * la recibe en el roster del término y la segunda en `leadershipContext` (ADR-121 regla 4).
 *
 * La agenda, el check-in «solo nuevos» y el onboarding miran solo el término de ingreso. Es otra
 * definición, y cuál queda es la decisión abierta 56: esta función no las reemplaza.
 */
export function isNewMemberInTerm(facts: NewMemberFacts, termId: string): boolean {
  return (facts.firstTermId === termId || facts.resumedNew) && !facts.reportAsVeteran;
}
