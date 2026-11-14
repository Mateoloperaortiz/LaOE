// El reparto por bolsa de los pronósticos del Athletic (ADR-197, precisión de la regla 7), el mismo de
// The Games (ADR-091 regla 4): cada acertante recibe lo que apostó más ⌊apuesta × bolsa perdedora /
// bolsa ganadora⌋, y el sobrante del redondeo se reparte de a uno por mayor resto, después por orden de
// llegada y después por id. La suma de los pagos es exactamente la bolsa. Si nadie acertó, se devuelve
// todo.

export interface PoolEntry {
  id: string;
  stake: number;
  createdAt: Date;
  won: boolean;
}

export type PoolOutcome =
  | { kind: "PAID"; payouts: Map<string, number> }
  | { kind: "REFUNDED"; payouts: Map<string, number> };

export function distributePool(entries: readonly PoolEntry[]): PoolOutcome {
  const winners = entries.filter((entry) => entry.won);
  if (winners.length === 0) {
    return { kind: "REFUNDED", payouts: new Map(entries.map((entry) => [entry.id, entry.stake])) };
  }
  const winningPool = winners.reduce((sum, entry) => sum + entry.stake, 0);
  const losingPool = entries
    .filter((entry) => !entry.won)
    .reduce((sum, entry) => sum + entry.stake, 0);
  const shares = winners.map((entry) => {
    const exact = (entry.stake * losingPool) / winningPool;
    const base = Math.floor(exact);
    return {
      entry,
      payout: entry.stake + base,
      remainder: entry.stake * losingPool - base * winningPool,
    };
  });
  let leftover =
    losingPool - shares.reduce((sum, share) => sum + (share.payout - share.entry.stake), 0);
  const order = [...shares].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      a.entry.createdAt.getTime() - b.entry.createdAt.getTime() ||
      a.entry.id.localeCompare(b.entry.id),
  );
  for (const share of order) {
    if (leftover <= 0) break;
    share.payout += 1;
    leftover -= 1;
  }
  return { kind: "PAID", payouts: new Map(shares.map((share) => [share.entry.id, share.payout])) };
}

/** Un parley acierta si acertó en cada pronóstico que incluye. */
export function parlayWon(
  picks: ReadonlyArray<{ optionId: string; winningOptionId: string | null }>,
): boolean {
  return picks.length > 0 && picks.every((pick) => pick.optionId === pick.winningOptionId);
}
