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
 * El total general sale de `elegibles` —quien puede entrar hoy— y no del roster del término: un
 * honorario o alguien en licencia puede no tener comité este semestre y necesita contraseña igual.
 * Contarlo por pertenencias los dejaría invisibles y la junta creería haber terminado.
 *
 * `filas` trae una fila por pertenencia, así que el conteo de cada comité sí cuenta pertenencias.
 */
export function calcularAvance(
  elegibles: readonly string[],
  filas: readonly FilaRoster[],
  conClave: ReadonlySet<string>,
): Avance {
  const personas = new Set(elegibles);
  let activadas = 0;
  for (const personId of personas) {
    if (conClave.has(personId)) {
      activadas += 1;
    }
  }
  const porComite = new Map<string, AvanceComite>();
  for (const fila of filas) {
    const actual = porComite.get(fila.committeeId) ?? { activadas: 0, total: 0 };
    porComite.set(fila.committeeId, {
      activadas: actual.activadas + (conClave.has(fila.personId) ? 1 : 0),
      total: actual.total + 1,
    });
  }
  return { personas: personas.size, activadas, porComite };
}
