import { GAME2048_MAX_MOVES } from "../game2048-engine";
import type { Game2048State } from "../game2048-types";

// Lo que el tablero del 2048 decide sin tocar el DOM (ADR-075 y ADR-122 regla 15).

/**
 * ¿Al tablero ya no le queda jugada? Se quedó sin movimientos o llegó al tope: la misma condición
 * con la que el motor deja de aplicar jugadas. Es el tablero que la pantalla cierra, porque dejarlo
 * «en juego» no ofrece ninguna salida.
 */
export function game2048Finished(state: Pick<Game2048State, "over" | "moves">): boolean {
  return state.over || state.moves >= GAME2048_MAX_MOVES;
}
