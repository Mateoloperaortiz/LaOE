import { describe, expect, it } from "vitest";
import { game2048Finished } from "@/modules/participation/components/game2048-resume";
import { GAME2048_MAX_MOVES } from "@/modules/participation/game2048-engine";

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
});
