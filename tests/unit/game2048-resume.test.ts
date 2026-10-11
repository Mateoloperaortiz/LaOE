import { describe, expect, it } from "vitest";
import {
  game2048Finished,
  game2048ReleasedBy,
} from "@/modules/participation/components/game2048-resume";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  newGame2048,
} from "@/modules/participation/game2048-engine";
import type {
  Game2048Denial,
  Game2048Move,
  Game2048State,
} from "@/modules/participation/game2048-types";

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

// Qué hace el tablero con su partida cuando la casa niega empezar o cerrar (ADR-123 regla 10). Una
// partida que se queda en el tablero después de una negativa no tiene salida: ninguna jugada la
// cierra y no hay botón que la suelte.

describe("partida del 2048 que la casa niega", () => {
  // Escrita como `Record` para que una negativa nueva no compile sin pasar por acá.
  const EVERY: Record<Game2048Denial, true> = {
    INVALID_INPUT: true,
    INVALID_MOVES: true,
    NOT_FOUND: true,
    NOT_ELIGIBLE: true,
    NO_TERM: true,
    TERM_CLOSED: true,
    EXPIRED: true,
    FINISHED: true,
    REQUEST_CONFLICT: true,
  };
  const denials = Object.keys(EVERY) as Game2048Denial[];
  const kept = () => denials.filter((reason) => !game2048ReleasedBy(reason));

  it("el día vencido, el semestre sin puntos, la persona que dejó de ser elegible y una partida ilegible sueltan la partida", () => {
    for (const reason of ["EXPIRED", "NO_TERM", "TERM_CLOSED", "NOT_ELIGIBLE", "INVALID_MOVES"]) {
      expect(game2048ReleasedBy(reason as Game2048Denial), reason).toBe(true);
    }
  });

  it("un cierre que la casa responde «ya terminó», «no existe», con un conflicto o como solicitud inválida también la suelta", () => {
    for (const reason of ["FINISHED", "NOT_FOUND", "REQUEST_CONFLICT", "INVALID_INPUT"]) {
      expect(game2048ReleasedBy(reason as Game2048Denial), reason).toBe(true);
    }
  });

  it("ninguna negativa deja la partida en el tablero: siempre queda empezar otra", () => {
    expect(kept()).toEqual([]);
  });
});
