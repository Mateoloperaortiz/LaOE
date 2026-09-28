import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { getEnv } from "@/env";
import { t } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { competition, competitionTeam } from "../schema";
import { normalizeTeamCode, teamCodeMatches } from "./codes-pure";
import {
  HUB_MAX_FAILURES_PER_IP,
  HUB_PATH,
  HUB_SESSION_MS,
  type HubSession,
  readHubSession,
  recentFailures,
  signHubSession,
} from "./hub-pure";

// El hub de capitanes (ADR-096): el capitán entra con el código de su equipo, sin cuenta, y solo ve y
// hace las apuestas de su equipo. Los fallos se cuentan por IP en memoria: la casa corre en un solo
// proceso (ADR-021) y un reinicio solo los olvida antes de tiempo.

const failuresByIp = new Map<string, number[]>();

/** Solo para pruebas. */
export function clearHubFailures(): void {
  failuresByIp.clear();
}

function tooManyFailures(ip: string | null | undefined, now: Date): boolean {
  if (!ip) return false;
  const recent = recentFailures(failuresByIp.get(ip) ?? [], now);
  if (recent.length === 0) failuresByIp.delete(ip);
  else failuresByIp.set(ip, recent);
  return recent.length >= HUB_MAX_FAILURES_PER_IP;
}

function countFailure(ip: string | null | undefined, now: Date): void {
  if (!ip) return;
  failuresByIp.set(ip, [...recentFailures(failuresByIp.get(ip) ?? [], now), now.getTime()]);
}

export type EnterHubResult = { ok: true; session: HubSession } | { ok: false; message: string };

/** Busca el equipo del código entre las competencias en vivo con apuestas. El capitán no elige su
 *  equipo: así nadie bloquea el código de otro a punta de intentos. */
export async function enterHub(
  ctx: CommandContext,
  rawCode: string,
  now = new Date(),
): Promise<EnterHubResult> {
  const ip = ctx.actor.ip;
  if (tooManyFailures(ip, now)) return { ok: false, message: t("T-3041") };
  const code = normalizeTeamCode(rawCode);
  const candidates = code
    ? await ctx.tx
        .select({
          id: competitionTeam.id,
          competitionId: competitionTeam.competitionId,
          codeHash: competitionTeam.codeHash,
          codeIssuedAt: competitionTeam.codeIssuedAt,
          codeLockedUntil: competitionTeam.codeLockedUntil,
          isRehearsal: competition.isRehearsal,
        })
        .from(competitionTeam)
        .innerJoin(competition, eq(competition.id, competitionTeam.competitionId))
        .where(
          and(
            eq(competition.status, "LIVE"),
            eq(competition.bettingEnabled, true),
            eq(competitionTeam.status, "ACTIVE"),
            isNotNull(competitionTeam.codeHash),
            isNotNull(competitionTeam.codeIssuedAt),
          ),
        )
    : [];
  const secret = getEnv().SESSION_SECRET;
  const team = candidates
    .sort((x, y) => Number(x.isRehearsal) - Number(y.isRehearsal))
    .find((item) => item.codeHash && code && teamCodeMatches(item.codeHash, secret, item.id, code));
  if (!team?.codeIssuedAt) {
    countFailure(ip, now);
    await ctx.audit({
      action: "competition.hub.code-failed",
      entityType: "competition_hub",
      entityId: "ingreso",
    });
    return { ok: false, message: t("T-3040") };
  }
  if (team.codeLockedUntil && team.codeLockedUntil > now) {
    return { ok: false, message: t("T-2779", { hora: formatTime(team.codeLockedUntil) }) };
  }
  await ctx.audit({
    action: "competition.hub.enter",
    entityType: "competition_team",
    entityId: team.id,
    after: { competitionId: team.competitionId },
  });
  return {
    ok: true,
    session: {
      competitionId: team.competitionId,
      teamId: team.id,
      codeIssuedAt: team.codeIssuedAt.getTime(),
      expiresAt: now.getTime() + HUB_SESSION_MS,
    },
  };
}

export interface HubTeam {
  competitionId: string;
  competitionName: string;
  isRehearsal: boolean;
  allowSelfBet: boolean;
  teamId: string;
  number: number;
  name: string;
  color: string | null;
}

/** El equipo de la sesión, si todavía vale: equipo activo, mismo código y competencia en vivo con
 *  apuestas. Si no, `null` y el hub vuelve a pedir el código. */
export async function getHubTeam(
  session: HubSession | null,
  exec: Executor = getDb(),
): Promise<HubTeam | null> {
  if (!session) return null;
  const [row] = await exec
    .select({
      competitionId: competition.id,
      competitionName: competition.name,
      status: competition.status,
      bettingEnabled: competition.bettingEnabled,
      isRehearsal: competition.isRehearsal,
      allowSelfBet: competition.allowSelfBet,
      teamId: competitionTeam.id,
      teamStatus: competitionTeam.status,
      number: competitionTeam.number,
      name: competitionTeam.name,
      color: competitionTeam.color,
      codeIssuedAt: competitionTeam.codeIssuedAt,
    })
    .from(competitionTeam)
    .innerJoin(competition, eq(competition.id, competitionTeam.competitionId))
    .where(
      and(
        eq(competitionTeam.id, session.teamId),
        eq(competitionTeam.competitionId, session.competitionId),
      ),
    )
    .limit(1);
  if (
    !row ||
    row.status !== "LIVE" ||
    !row.bettingEnabled ||
    row.teamStatus !== "ACTIVE" ||
    row.codeIssuedAt?.getTime() !== session.codeIssuedAt
  ) {
    return null;
  }
  return {
    competitionId: row.competitionId,
    competitionName: row.competitionName,
    isRehearsal: row.isRehearsal,
    allowSelfBet: row.allowSelfBet,
    teamId: row.teamId,
    number: row.number,
    name: row.name,
    color: row.color,
  };
}

/** El valor de la cookie del hub, firmado con el secreto de la casa. */
export function hubCookieValue(session: HubSession): string {
  return signHubSession(getEnv().SESSION_SECRET, session);
}

/** La sesión de la cookie del hub, si está bien firmada y no venció. */
export function hubSessionFromCookie(value: string | undefined, now = new Date()) {
  return readHubSession(getEnv().SESSION_SECRET, value, now);
}

/** La dirección del hub para las tarjetas, sin protocolo: oeeafit.com/capitanes. */
export function hubAddress(): string {
  return `${new URL(getEnv().APP_URL).host}${HUB_PATH}`;
}
