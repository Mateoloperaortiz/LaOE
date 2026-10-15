import { describe, expect, it } from "vitest";
import { levelCutoffsForTerm, levelFor } from "@/modules/participation/domain/ledger-pure";

const SEPARATED_CUTOFFS = [0, 25, 75, 150, 250];
const historical = { gamePointsSeparated: false };
const separated = { gamePointsSeparated: true };

describe("niveles según la política del semestre", () => {
  it("conserva Pilar y el siguiente corte en un saldo mixto histórico de 500", () => {
    const cutoffs = levelCutoffsForTerm(historical, SEPARATED_CUTOFFS);
    expect(cutoffs).toEqual([0, 100, 250, 500, 1000]);
    expect(levelFor(500, cutoffs)).toEqual({
      index: 3,
      min: 500,
      next: 1000,
      remaining: 500,
    });
  });

  it("reconoce Leyenda OE desde 250 en el saldo separado", () => {
    const cutoffs = levelCutoffsForTerm(separated, SEPARATED_CUTOFFS);
    expect(cutoffs).toEqual([0, 25, 75, 150, 250]);
    expect(levelFor(250, cutoffs)).toEqual({
      index: 4,
      min: 250,
      next: null,
      remaining: null,
    });
  });

  it.each([
    { total: 24, historicalIndex: 0, separatedIndex: 0 },
    { total: 25, historicalIndex: 0, separatedIndex: 1 },
    { total: 75, historicalIndex: 0, separatedIndex: 2 },
    { total: 100, historicalIndex: 1, separatedIndex: 2 },
    { total: 150, historicalIndex: 1, separatedIndex: 3 },
    { total: 250, historicalIndex: 2, separatedIndex: 4 },
    { total: 500, historicalIndex: 3, separatedIndex: 4 },
    { total: 1000, historicalIndex: 4, separatedIndex: 4 },
  ])("ubica $total puntos con los cortes de su semestre", ({
    total,
    historicalIndex,
    separatedIndex,
  }) => {
    expect(levelFor(total, levelCutoffsForTerm(historical, SEPARATED_CUTOFFS)).index).toBe(
      historicalIndex,
    );
    expect(levelFor(total, levelCutoffsForTerm(separated, SEPARATED_CUTOFFS)).index).toBe(
      separatedIndex,
    );
  });

  it("cambiar la escala vigente no reinterpreta los semestres mixtos", () => {
    const changedCutoffs = [0, 20, 60, 120, 200];
    expect(levelCutoffsForTerm(separated, changedCutoffs)).toEqual(changedCutoffs);
    expect(levelFor(500, levelCutoffsForTerm(historical, changedCutoffs)).index).toBe(3);
  });
});
