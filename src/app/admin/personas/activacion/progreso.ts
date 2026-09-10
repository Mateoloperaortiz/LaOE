// Avance de la campaña de activación (ADR-051): cuánta gente del término ya eligió contraseña.
// Vive en src/app porque compone el roster de `people` con las credenciales de `identity`, y ni
// uno ni otro conoce al de al lado.

export interface FilaRoster {
  personId: string;
  committeeId: string;
}

export interface AvanceComite {
  activadas: number;
  total: number;
}

export interface Avance {
  /** Personas distintas del término: quien está en tres comités cuenta una vez. */
  personas: number;
  activadas: number;
  porComite: Map<string, AvanceComite>;
}

/**
 * `filas` trae una fila por pertenencia, así que una persona en varios comités aparece varias
 * veces: el total general cuenta personas distintas y el de cada comité cuenta sus pertenencias.
 */
export function calcularAvance(
  filas: readonly FilaRoster[],
  conClave: ReadonlySet<string>,
): Avance {
  const personas = new Set<string>();
  const activadas = new Set<string>();
  const porComite = new Map<string, AvanceComite>();
  for (const fila of filas) {
    personas.add(fila.personId);
    const tiene = conClave.has(fila.personId);
    if (tiene) {
      activadas.add(fila.personId);
    }
    const actual = porComite.get(fila.committeeId) ?? { activadas: 0, total: 0 };
    porComite.set(fila.committeeId, {
      activadas: actual.activadas + (tiene ? 1 : 0),
      total: actual.total + 1,
    });
  }
  return { personas: personas.size, activadas: activadas.size, porComite };
}
