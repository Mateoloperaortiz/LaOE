// Apuestas de The Games sin I/O (ADR-091): estado de una apuesta según la hora, reparto por bolsa
// que conserva el total y saldo de un equipo. Los puntos de apuestas no son dinero, no son GH Points
// y no cuentan para el ganador.

export const MARKET_STATUSES = ["DRAFT", "OPEN", "CLOSED", "RESOLVED", "CANCELLED"] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

/** Una apuesta abierta cuyo cierre ya pasó se considera cerrada, sin necesidad de un job. */
export function marketState(
  market: { status: MarketStatus; closesAt: Date | null },
  now: Date,
): MarketStatus {
  if (market.status === "OPEN" && market.closesAt && market.closesAt.getTime() <= now.getTime()) {
    return "CLOSED";
  }
  return market.status;
}

export interface BetLike {
  id: string;
  teamId: string;
  pickTeamId: string;
  stake: number;
  createdAt: Date;
}

export interface Settlement {
  betId: string;
  teamId: string;
  kind: "PAYOUT" | "REFUND";
  amount: number;
}

/** Reparto por bolsa (ADR-091 regla 4). Cada acertante recibe su apuesta más
 *  ⌊apuesta × perdedora / ganadora⌋, y el sobrante del redondeo va por mayor resto, después por
 *  orden de llegada y después por id: la suma de los pagos es la bolsa entera. Si nadie acertó o
 *  la apuesta se cancela (`winnerTeamId` nulo), se devuelve todo. Los perdedores no reciben filas. */
export function settleParimutuel(
  bets: readonly BetLike[],
  winnerTeamId: string | null,
): Settlement[] {
  for (const bet of bets) {
    if (!Number.isSafeInteger(bet.stake) || bet.stake <= 0) {
      throw new RangeError(`Apuesta ${bet.id} con valor inválido.`);
    }
  }
  const winners = winnerTeamId ? bets.filter((bet) => bet.pickTeamId === winnerTeamId) : [];
  if (winners.length === 0) {
    return bets.map((bet) => ({
      betId: bet.id,
      teamId: bet.teamId,
      kind: "REFUND",
      amount: bet.stake,
    }));
  }
  const winning = winners.reduce((sum, bet) => sum + bet.stake, 0);
  const losing = bets.reduce((sum, bet) => sum + bet.stake, 0) - winning;
  const shares = winners.map((bet) => {
    const product = BigInt(bet.stake) * BigInt(losing);
    return {
      bet,
      whole: Number(product / BigInt(winning)),
      remainder: Number(product % BigInt(winning)),
    };
  });
  let leftover = losing - shares.reduce((sum, share) => sum + share.whole, 0);
  const byRemainder = [...shares].sort(
    (x, y) =>
      y.remainder - x.remainder ||
      x.bet.createdAt.getTime() - y.bet.createdAt.getTime() ||
      (x.bet.id < y.bet.id ? -1 : x.bet.id > y.bet.id ? 1 : 0),
  );
  const extra = new Map<string, number>();
  for (const share of byRemainder) {
    if (leftover <= 0) break;
    extra.set(share.bet.id, 1);
    leftover -= 1;
  }
  return shares.map(({ bet, whole }) => ({
    betId: bet.id,
    teamId: bet.teamId,
    kind: "PAYOUT",
    amount: bet.stake + whole + (extra.get(bet.id) ?? 0),
  }));
}

/** Cuánto sumó cada opción de una apuesta, para la vitrina. */
export function poolByOption(
  bets: readonly Pick<BetLike, "pickTeamId" | "stake">[],
): Map<string, number> {
  const pools = new Map<string, number>();
  for (const bet of bets) pools.set(bet.pickTeamId, (pools.get(bet.pickTeamId) ?? 0) + bet.stake);
  return pools;
}

/** El saldo es la suma del libro de puntos de apuestas del equipo. */
export function balanceOf(entries: readonly { amount: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}
