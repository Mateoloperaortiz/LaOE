import { describe, expect, it } from "vitest";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  GAME2048_REWARDS,
  game2048Reward,
  isGame2048Move,
  isGame2048Moves,
  isGame2048Seed,
  newGame2048,
  replayGame2048,
} from "@/modules/participation/game2048-engine";
import type { Game2048Move, Game2048State } from "@/modules/participation/game2048-types";

const SEED = "0123456789abcdef";
const OTHER = "fedcba9876543210";
const ORDER: Game2048Move[] = ["L", "U", "R", "D"];

/** Partida completa con un jugador simple: sirve de material para el resto de las pruebas. */
function playOut(seed: string): { state: Game2048State; moves: string } {
  let state = newGame2048(seed);
  const moves: Game2048Move[] = [];
  while (!state.over && moves.length < GAME2048_MAX_MOVES) {
    const next = ORDER.map((move) => ({ move, state: applyGame2048Move(state, move) })).find(
      (option) => option.state !== null,
    );
    if (!next?.state) {
      break;
    }
    state = next.state;
    moves.push(next.move);
  }
  return { state, moves: moves.join("") };
}

function boardOf(cells: number[]): Game2048State {
  return {
    board: cells,
    score: 0,
    maxTile: Math.max(...cells),
    moves: 0,
    over: false,
    rng: newGame2048(SEED).rng,
  };
}

describe("tablero del 2048", () => {
  it("arranca con dos fichas y sin puntaje", () => {
    const start = newGame2048(SEED);
    expect(start.board).toHaveLength(16);
    expect(start.board.filter((value) => value !== 0)).toHaveLength(2);
    expect(start.board.every((value) => value === 0 || value === 2 || value === 4)).toBe(true);
    expect(start.score).toBe(0);
    expect(start.moves).toBe(0);
    expect(start.over).toBe(false);
  });

  it("junta dos fichas iguales y suma su valor al puntaje", () => {
    const moved = applyGame2048Move(boardOf([2, 2, 4, 4, ...new Array(12).fill(0)]), "L");
    expect(moved?.board.slice(0, 4)).toEqual([4, 8, 0, 0]);
    expect(moved?.score).toBe(12);
  });

  it("una ficha recién fusionada no vuelve a fusionarse en el mismo movimiento", () => {
    const moved = applyGame2048Move(boardOf([4, 4, 4, 4, ...new Array(12).fill(0)]), "L");
    expect(moved?.board.slice(0, 4)).toEqual([8, 8, 0, 0]);
    expect(moved?.score).toBe(16);
  });

  it("mueve en las cuatro direcciones contra el borde que corresponde", () => {
    const fila = [0, 0, 0, 2, ...new Array(12).fill(0)];
    expect(applyGame2048Move(boardOf(fila), "L")?.board[0]).toBe(2);
    const columna = [2, ...new Array(15).fill(0)];
    expect(applyGame2048Move(boardOf(columna), "D")?.board[12]).toBe(2);
  });

  it("devuelve null cuando el movimiento no mueve nada", () => {
    // Fila llena arriba y una ficha suelta pegada a la izquierda: nada se mueve hacia la izquierda.
    const pegado = boardOf([2, 4, 8, 16, 2, 0, 0, 0, ...new Array(8).fill(0)]);
    expect(applyGame2048Move(pegado, "L")).toBeNull();
    expect(applyGame2048Move(pegado, "R")).not.toBeNull();
  });

  it("termina cuando no queda ninguna jugada", () => {
    const lleno = boardOf([2, 4, 8, 16, 4, 8, 16, 2, 8, 16, 2, 4, 16, 2, 4, 8]);
    expect(ORDER.every((move) => applyGame2048Move(lleno, move) === null)).toBe(true);
  });

  it("agrega exactamente una ficha por movimiento", () => {
    const start = newGame2048(SEED);
    const moved = ORDER.map((move) => applyGame2048Move(start, move)).find((next) => next !== null);
    const antes = start.board.filter((value) => value !== 0).length;
    const despues = moved?.board.filter((value) => value !== 0).length ?? 0;
    // Sin fusión el conteo sube en uno; con fusión se mantiene, porque dos fichas se volvieron una.
    expect([antes, antes + 1]).toContain(despues);
  });
});

describe("determinismo del 2048", () => {
  it("la misma semilla produce siempre la misma partida", () => {
    const uno = playOut(SEED);
    const dos = playOut(SEED);
    expect(dos.moves).toBe(uno.moves);
    expect(dos.state.board).toEqual(uno.state.board);
    expect(dos.state.score).toBe(uno.state.score);
  });

  it("dos semillas distintas divergen", () => {
    expect(newGame2048(OTHER).board).not.toEqual(newGame2048(SEED).board);
  });

  it("no usa coma flotante: puntaje y fichas son enteros", () => {
    const { state } = playOut(SEED);
    expect(Number.isInteger(state.score)).toBe(true);
    expect(state.board.every((value) => Number.isInteger(value))).toBe(true);
    expect(state.rng.every((word) => Number.isInteger(word))).toBe(true);
  });

  it("reparte fichas de 4 alrededor de una de cada diez veces", () => {
    let cuatros = 0;
    let total = 0;
    for (let partida = 0; partida < 400; partida += 1) {
      const start = newGame2048(partida.toString(16).padStart(16, "0"));
      for (const value of start.board) {
        if (value !== 0) {
          total += 1;
          if (value === 4) {
            cuatros += 1;
          }
        }
      }
    }
    expect(cuatros / total).toBeGreaterThan(0.05);
    expect(cuatros / total).toBeLessThan(0.16);
  });
});

describe("replay verificado del 2048", () => {
  it("rejugar la lista reproduce el puntaje exacto de la partida", () => {
    const { state, moves } = playOut(SEED);
    const replay = replayGame2048(SEED, moves);
    expect(replay?.score).toBe(state.score);
    expect(replay?.maxTile).toBe(state.maxTile);
    expect(replay?.moves).toBe(state.moves);
    expect(replay?.board).toEqual(state.board);
  });

  it("un puntaje inventado no tiene lista de movimientos que lo sostenga", () => {
    const { state, moves } = playOut(SEED);
    expect(replayGame2048(SEED, moves)?.score).not.toBe(state.score + 4);
  });

  it("la misma lista con otra semilla no reproduce el puntaje", () => {
    const { state, moves } = playOut(SEED);
    const ajeno = replayGame2048(OTHER, moves);
    expect(ajeno === null || ajeno.score !== state.score).toBe(true);
  });

  it("rechaza la lista entera si contiene un movimiento inerte", () => {
    const { moves } = playOut(SEED);
    expect(replayGame2048(SEED, `${moves}L`)).toBeNull();
  });

  it("rechaza caracteres ajenos y listas más largas que el tope", () => {
    expect(replayGame2048(SEED, "LULX")).toBeNull();
    expect(replayGame2048(SEED, "L".repeat(GAME2048_MAX_MOVES + 1))).toBeNull();
  });

  it("rechaza una semilla con formato inválido", () => {
    expect(replayGame2048("no-es-una-semilla", "L")).toBeNull();
    expect(replayGame2048("0123456789ABCDEF", "L")).toBeNull();
  });

  it("una lista vacía es el tablero inicial", () => {
    expect(replayGame2048(SEED, "")).toEqual(newGame2048(SEED));
  });
});

describe("premios del 2048", () => {
  it("paga el umbral más alto alcanzado", () => {
    expect(game2048Reward(999)).toBe(0);
    expect(game2048Reward(1_000)).toBe(1);
    expect(game2048Reward(2_499)).toBe(1);
    expect(game2048Reward(2_500)).toBe(2);
    expect(game2048Reward(5_000)).toBe(3);
    expect(game2048Reward(9_000)).toBe(4);
    expect(game2048Reward(13_000)).toBe(5);
    expect(game2048Reward(20_000)).toBe(6);
  });

  it("nunca pasa del techo del Wordle ni baja de cero", () => {
    expect(game2048Reward(10_000_000)).toBe(6);
    expect(game2048Reward(-1)).toBe(0);
    expect(game2048Reward(1.5)).toBe(0);
  });

  it("los umbrales están ordenados de mayor a menor y caben en el check del ledger", () => {
    const puntajes = GAME2048_REWARDS.map(([score]) => score);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
    expect(GAME2048_REWARDS.every(([, points]) => points >= 1 && points <= 6)).toBe(true);
  });

  it("cada umbral queda por debajo del costo de la ficha que representa", () => {
    // Llegar a la ficha 2^n cuesta (n-1)·2^n puntos de fusiones.
    const costo = (n: number) => (n - 1) * 2 ** n;
    expect(game2048Reward(costo(11))).toBe(6); // 2048 → 20.480
    expect(game2048Reward(costo(10))).toBe(4); // 1024 → 9.216
    expect(game2048Reward(costo(9))).toBe(2); // 512 → 4.096
  });
});

describe("formatos del 2048", () => {
  it("acepta la semilla de dieciséis dígitos hexadecimales en minúscula", () => {
    expect(isGame2048Seed(SEED)).toBe(true);
    expect(isGame2048Seed("0123456789ABCDEF")).toBe(false);
    expect(isGame2048Seed("0123456789abcde")).toBe(false);
  });

  it("acepta solo listas de U, D, L y R dentro del tope", () => {
    expect(isGame2048Moves("")).toBe(true);
    expect(isGame2048Moves("UDLR")).toBe(true);
    expect(isGame2048Moves("udlr")).toBe(false);
    expect(isGame2048Moves("L".repeat(GAME2048_MAX_MOVES))).toBe(true);
    expect(isGame2048Moves("L".repeat(GAME2048_MAX_MOVES + 1))).toBe(false);
  });

  it("reconoce un movimiento suelto", () => {
    expect(ORDER.every(isGame2048Move)).toBe(true);
    expect(isGame2048Move("X")).toBe(false);
    expect(isGame2048Move("LL")).toBe(false);
  });
});
