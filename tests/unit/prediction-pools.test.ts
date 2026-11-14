import { describe, expect, it } from "vitest";
import { distributePool, parlayWon } from "@/modules/predictions/domain/pools-pure";

// El reparto por bolsa de los pronósticos del Athletic (ADR-197, precisión de la regla 7).

const at = (minute: number) => new Date(Date.UTC(2099, 2, 2, 18, minute));

describe("la bolsa de un pronóstico", () => {
  it("los que aciertan se reparten lo de los que fallan, en proporción a lo que apostaron", () => {
    const outcome = distributePool([
      { id: "a", stake: 10, createdAt: at(1), won: true },
      { id: "b", stake: 30, createdAt: at(2), won: true },
      { id: "c", stake: 20, createdAt: at(3), won: false },
    ]);
    expect(outcome.kind).toBe("PAID");
    expect(Object.fromEntries(outcome.payouts)).toEqual({ a: 15, b: 45 });
  });

  it("el redondeo va por mayor resto y después por orden de llegada, y la suma es la bolsa", () => {
    const outcome = distributePool([
      { id: "a", stake: 1, createdAt: at(1), won: true },
      { id: "b", stake: 1, createdAt: at(2), won: true },
      { id: "c", stake: 1, createdAt: at(3), won: true },
      { id: "d", stake: 2, createdAt: at(4), won: false },
    ]);
    const payouts = Object.fromEntries(outcome.payouts);
    expect(payouts).toEqual({ a: 2, b: 2, c: 1 });
    expect(Object.values(payouts).reduce((sum, n) => sum + n, 0)).toBe(5);
  });

  it("si nadie acierta, se devuelve todo", () => {
    const outcome = distributePool([
      { id: "a", stake: 7, createdAt: at(1), won: false },
      { id: "b", stake: 3, createdAt: at(2), won: false },
    ]);
    expect(outcome.kind).toBe("REFUNDED");
    expect(Object.fromEntries(outcome.payouts)).toEqual({ a: 7, b: 3 });
  });

  it("si todos aciertan, cada uno recupera lo suyo", () => {
    expect(
      Object.fromEntries(
        distributePool([
          { id: "a", stake: 4, createdAt: at(1), won: true },
          { id: "b", stake: 6, createdAt: at(2), won: true },
        ]).payouts,
      ),
    ).toEqual({ a: 4, b: 6 });
  });
});

describe("el parley", () => {
  it("acierta solo si acierta todo lo que incluye", () => {
    expect(
      parlayWon([
        { optionId: "x", winningOptionId: "x" },
        { optionId: "y", winningOptionId: "y" },
      ]),
    ).toBe(true);
    expect(
      parlayWon([
        { optionId: "x", winningOptionId: "x" },
        { optionId: "y", winningOptionId: "z" },
      ]),
    ).toBe(false);
    expect(parlayWon([])).toBe(false);
  });
});
