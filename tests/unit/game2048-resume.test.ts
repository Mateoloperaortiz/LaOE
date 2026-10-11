import { describe, expect, it } from "vitest";
import { game2048Finished } from "@/modules/participation/components/game2048-resume";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  newGame2048,
} from "@/modules/participation/game2048-engine";
import type { Game2048Move, Game2048State } from "@/modules/participation/game2048-types";

// A qué tablero ya no le queda jugada (ADR-122 regla 15): el que la pantalla cierra en vez de dejarlo
// «en juego».

describe("tablero del 2048 sin jugada", () => {
  it("un tablero a medias sigue en juego", () => {
    expect(game2048Finished({ over: false, moves: 12 })).toBe(false);
    expect(game2048Finished({ over: false, moves: GAME2048_MAX_MOVES - 1 })).toBe(false);
  });

  it("un tablero sin movimientos posibles terminó", () => {
    expect(game2048Finished({ over: true, moves: 80 })).toBe(true);
  });

  it("un tablero que llegó al tope de movimientos terminó aunque le queden jugadas", () => {
    expect(game2048Finished({ over: false, moves: GAME2048_MAX_MOVES })).toBe(true);
  });

  // La condición está escrita también en el motor, que no se toca (ADR-109 regla 10). Los casos de
  // arriba la fijan con literales; este la compara con lo que el motor hace, así que si el motor
  // cambia cuándo deja de aplicar jugadas, la copia de la pantalla queda en rojo.
  it("dice lo mismo que el motor en cada tablero de una partida: terminó cuando ninguna jugada se aplica", () => {
    const moves: Game2048Move[] = ["U", "L", "D", "R"];
    const next = (state: Game2048State) =>
      moves.map((move) => applyGame2048Move(state, move)).find((after) => after !== null) ?? null;
    let state = newGame2048("0123456789abcdef");
    let played = 0;
    for (let after = next(state); after !== null; after = next(state)) {
      expect(game2048Finished(state)).toBe(false);
      state = after;
      played += 1;
    }
    expect(played).toBeGreaterThan(0);
    expect(game2048Finished(state)).toBe(true);

    // El tope: un tablero recién repartido, con jugadas posibles, que ya gastó sus movimientos.
    const capped = { ...newGame2048("0123456789abcdef"), moves: GAME2048_MAX_MOVES };
    expect(next({ ...capped, moves: GAME2048_MAX_MOVES - 1 })).not.toBeNull();
    expect(next(capped)).toBeNull();
    expect(game2048Finished(capped)).toBe(true);
  });
});
