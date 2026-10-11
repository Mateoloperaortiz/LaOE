import { GAME2048_MAX_MOVES } from "../game2048-engine";
import type { Game2048Denial, Game2048State } from "../game2048-types";

// Lo que el tablero del 2048 decide sin tocar el DOM (ADR-075 y ADR-122 regla 15).

/**
 * ¿Al tablero ya no le queda jugada? Se quedó sin movimientos o llegó al tope: la misma condición
 * con la que el motor deja de aplicar jugadas. Es el tablero que la pantalla cierra, porque dejarlo
 * «en juego» no ofrece ninguna salida.
 */
export function game2048Finished(state: Pick<Game2048State, "over" | "moves">): boolean {
  return state.over || state.moves >= GAME2048_MAX_MOVES;
}

// Por negativa, para que una nueva no compile sin decidirse acá.
const RELEASES: Record<Game2048Denial, boolean> = {
  // Esa partida ya no está abierta en la casa: se cerró por otro lado (otra pestaña), no existe o
  // se le pasó el día.
  FINISHED: true,
  NOT_FOUND: true,
  REQUEST_CONFLICT: true,
  EXPIRED: true,
  // La casa ya no la cierra.
  NO_TERM: true,
  TERM_CLOSED: true,
  NOT_ELIGIBLE: true,
  // La casa no acepta lo que el navegador guardó, y volver a mandarlo recibe lo mismo.
  INVALID_INPUT: true,
  INVALID_MOVES: true,
};

/**
 * ¿El tablero suelta su partida cuando la casa niega empezar o cerrar? Con cualquier negativa
 * (ADR-123 regla 10): con ninguna queda algo que seguir jugando o que volver a enviar. Soltarla
 * borra lo guardado en el navegador y deja «Empezar una partida»; una partida que se queda en el
 * tablero después de una negativa no tiene salida, porque ninguna jugada la cierra y no hay botón
 * que la suelte. Un envío sin respuesta no es una negativa: ahí el tablero se conserva y queda
 * «Reintentar envío».
 */
export function game2048ReleasedBy(reason: Game2048Denial): boolean {
  return RELEASES[reason];
}
