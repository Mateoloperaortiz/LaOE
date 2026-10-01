import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { MarketStatus } from "./betting-pure";
import { POWER_EFFECTS, POWER_TYPES } from "./powers-pure";
import { type RouteStop, routeStopSchema } from "./route-pure";

// El hub de capitanes (ADR-096), sin I/O: la sesión es una cookie firmada del equipo, no de una
// persona, con la competencia, el equipo, cuándo se emitió su código y cuándo vence. Volver a emitir
// el código la invalida, porque cambia `codeIssuedAt`. El estado que ve DÍAS identifica a los equipos
// por número, nunca por id.

export const HUB_COOKIE = "oe_capitanes";
export const HUB_API_PATH = "/api/v1/the-games/hub";
export const HUB_SESSION_MS = 12 * 60 * 60_000;
export const HUB_MAX_FAILURES_PER_IP = 30;
export const HUB_FAILURE_WINDOW_MS = 15 * 60_000;
export const HUB_VERSION = 1;
/** La versión vigente de las instrucciones del hub (ADR-099). El texto vive en DÍAS (D-042);
 *  cambiarlo sube la versión en los dos repos y cada equipo vuelve a aceptar. */
export const HUB_TERMS_VERSION = 2;

export interface HubSession {
  competitionId: string;
  teamId: string;
  /** `codeIssuedAt` del equipo, en milisegundos. */
  codeIssuedAt: number;
  expiresAt: number;
}

const VERSION = "v1";

function signature(secret: string, payload: string): string {
  return createHmac("sha256", `competition-hub:${secret}`).update(payload).digest("base64url");
}

export function signHubSession(secret: string, session: HubSession): string {
  const payload = [
    VERSION,
    session.competitionId,
    session.teamId,
    session.codeIssuedAt,
    session.expiresAt,
  ].join(".");
  return `${payload}.${signature(secret, payload)}`;
}

/** La sesión de la cookie, si está bien firmada y no ha vencido. */
export function readHubSession(
  secret: string,
  token: string | undefined,
  now: Date,
): HubSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== VERSION) return null;
  const [, competitionId = "", teamId = "", issued = "", expires = "", signed = ""] = parts;
  const expected = Buffer.from(signature(secret, parts.slice(0, 5).join(".")));
  const actual = Buffer.from(signed);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const codeIssuedAt = Number(issued);
  const expiresAt = Number(expires);
  if (!competitionId || !teamId) return null;
  if (!Number.isSafeInteger(codeIssuedAt) || !Number.isSafeInteger(expiresAt)) return null;
  if (expiresAt <= now.getTime()) return null;
  return { competitionId, teamId, codeIssuedAt, expiresAt };
}

/** Los fallos recientes de una IP, sin los que ya salieron de la ventana. */
export function recentFailures(times: readonly number[], now: Date): number[] {
  const since = now.getTime() - HUB_FAILURE_WINDOW_MS;
  return times.filter((time) => time > since);
}

const hubTeam = z.object({
  number: z.number().int(),
  name: z.string(),
  color: z.string().nullable(),
});

export const hubStateSchema = z.object({
  version: z.literal(HUB_VERSION),
  serverNow: z.iso.datetime(),
  competition: z.object({
    name: z.string(),
    rehearsal: z.boolean(),
    allowSelfBet: z.boolean(),
  }),
  team: hubTeam,
  balance: z.number().int(),
  /** Solo las apuestas abiertas. */
  markets: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      closesAt: z.iso.datetime().nullable(),
      options: z.array(hubTeam.extend({ pool: z.number().int(), own: z.boolean() })),
      myBet: z.object({ pick: z.number().int(), stake: z.number().int() }).nullable(),
    }),
  ),
  /** El recorrido del equipo en las dos jornadas (ADR-097). */
  route: z.array(routeStopSchema),
  /** Las tarjetas de poder del equipo (ADR-098), sin las anuladas: jornada, estado y, si se usó, dónde
   *  y con qué efecto. El capitán solo consulta. */
  powers: z.array(
    z.object({
      power: z.enum(POWER_TYPES),
      day: z.union([z.literal(1), z.literal(2)]),
      status: z.enum(["ASSIGNED", "DELIVERED", "USED", "EXPIRED"]),
      use: z
        .object({
          rotation: z.number().int(),
          base: z.string(),
          rival: z.object({ number: z.number().int(), name: z.string() }),
          effect: z.enum(["PENDING", ...POWER_EFFECTS]),
        })
        .nullable(),
    }),
  ),
  /** Las apuestas del equipo, de la más nueva a la más vieja. */
  bets: z.array(
    z.object({
      marketId: z.string(),
      title: z.string(),
      pick: hubTeam,
      stake: z.number().int(),
      result: z.enum(["PENDING", "WON", "LOST", "REFUNDED", "CANCELLED"]),
      /** Lo que recibió: el pago si acertó o la devolución; 0 si no. */
      amount: z.number().int(),
    }),
  ),
});
export type HubState = z.infer<typeof hubStateSchema>;

export interface HubSource {
  competition: { name: string; isRehearsal: boolean; allowSelfBet: boolean };
  teamId: string;
  teams: ReadonlyArray<{ id: string; number: number; name: string; color: string | null }>;
  balance: number;
  markets: ReadonlyArray<{
    id: string;
    title: string;
    status: MarketStatus;
    closesAt: Date | null;
    winnerTeamId: string | null;
    options: readonly string[];
    pools: ReadonlyMap<string, number>;
    bets: ReadonlyArray<{ id: string; teamId: string; pickTeamId: string; stake: number }>;
  }>;
  returns: ReadonlyMap<string, { kind: "PAYOUT" | "REFUND"; amount: number }>;
  route: readonly RouteStop[];
  powers: HubState["powers"];
}

/** Arma el estado del hub para el equipo de la sesión, sin `serverNow`. */
export function toHubState(source: HubSource): Omit<HubState, "serverNow"> {
  const byId = new Map(source.teams.map((team) => [team.id, team]));
  const teamOf = (id: string) => {
    const found = byId.get(id);
    return { number: found?.number ?? 0, name: found?.name ?? "", color: found?.color ?? null };
  };
  const own = byId.get(source.teamId);
  const mine = source.markets.flatMap((market) => {
    const bet = market.bets.find((item) => item.teamId === source.teamId);
    return bet ? [{ market, bet }] : [];
  });
  return {
    version: HUB_VERSION,
    competition: {
      name: source.competition.name,
      rehearsal: source.competition.isRehearsal,
      allowSelfBet: source.competition.allowSelfBet,
    },
    team: { number: own?.number ?? 0, name: own?.name ?? "", color: own?.color ?? null },
    balance: source.balance,
    route: [...source.route],
    powers: [...source.powers],
    markets: source.markets
      .filter((market) => market.status === "OPEN")
      .map((market) => {
        const bet = market.bets.find((item) => item.teamId === source.teamId);
        return {
          id: market.id,
          title: market.title,
          closesAt: market.closesAt?.toISOString() ?? null,
          options: market.options.map((teamId) => ({
            ...teamOf(teamId),
            pool: market.pools.get(teamId) ?? 0,
            own: teamId === source.teamId,
          })),
          myBet: bet ? { pick: teamOf(bet.pickTeamId).number, stake: bet.stake } : null,
        };
      }),
    bets: mine.map(({ market, bet }) => {
      const received = source.returns.get(bet.id);
      const result =
        market.status === "CANCELLED"
          ? ("CANCELLED" as const)
          : market.status !== "RESOLVED"
            ? ("PENDING" as const)
            : received?.kind === "PAYOUT"
              ? ("WON" as const)
              : received?.kind === "REFUND"
                ? ("REFUNDED" as const)
                : ("LOST" as const);
      return {
        marketId: market.id,
        title: market.title,
        pick: teamOf(bet.pickTeamId),
        stake: bet.stake,
        result,
        amount: received?.amount ?? 0,
      };
    }),
  };
}
