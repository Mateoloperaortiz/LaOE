import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  canParticipate,
  getMembershipRef,
  getPeopleByIds,
  socialVisibleIds,
} from "@/modules/people";
import { addDays, atHourIn } from "@/shared/lib/dates-pure";
import { leagueStanding, pointEntry } from "../schema";
import { dayKeyFor, GAMIFICATION_TIMEZONE } from "./gamification-pure";
import {
  type LeagueRow,
  type LeagueTier,
  leagueTable,
  leagueWeekOf,
  nextTiers,
  promoted,
} from "./league-pure";
import { ghPointCondition } from "./ledger-classification";

// Las ligas semanales (ADR-178): la liga de cada persona vive en `league_standing` por semana; la
// tabla se arma con los GH Points ganados en la semana, del mismo libro de puntos. Entra quien tiene la
// actividad prendida (ADR-175) y puede participar.

export interface LeagueView {
  weekStart: string;
  tier: LeagueTier;
  promoted: boolean;
  myPoints: number;
  table: Array<{ personId: string; name: string; points: number; me: boolean }>;
}

/** Los GH Points ganados en una semana por estas personas. */
async function weekPoints(personIds: string[], weekStart: string): Promise<Map<string, number>> {
  if (personIds.length === 0) return new Map();
  const from = atHourIn(GAMIFICATION_TIMEZONE, weekStart, 0);
  const to = atHourIn(GAMIFICATION_TIMEZONE, addDays(weekStart, 7), 0);
  const rows = await getDb()
    .select({
      personId: pointEntry.personId,
      points: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int`,
    })
    .from(pointEntry)
    .where(
      and(
        inArray(pointEntry.personId, personIds),
        gte(pointEntry.createdAt, from),
        lt(pointEntry.createdAt, to),
        ghPointCondition,
        sql`${pointEntry.points} > 0`,
      ),
    )
    .groupBy(pointEntry.personId);
  return new Map(rows.map((row) => [row.personId, row.points]));
}

/** La liga de la persona esta semana: la crea si falta, con la de la semana anterior o Bronce. */
async function ensureStanding(personId: string, weekStart: string): Promise<LeagueTier> {
  const db = getDb();
  const [current] = await db
    .select({ tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(and(eq(leagueStanding.personId, personId), eq(leagueStanding.weekStart, weekStart)));
  if (current) return current.tier;
  const [previous] = await db
    .select({ tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(
      and(
        eq(leagueStanding.personId, personId),
        eq(leagueStanding.weekStart, addDays(weekStart, -7)),
      ),
    );
  const tier = previous?.tier ?? "BRONCE";
  await db.insert(leagueStanding).values({ personId, weekStart, tier }).onConflictDoNothing();
  return tier;
}

/**
 * La liga de la persona esta semana, o `null` si no entra: no puede participar o tiene la actividad
 * apagada. La tabla solo trae a quienes tienen la actividad prendida.
 */
export async function myLeague(personId: string, now = new Date()): Promise<LeagueView | null> {
  const [visible, membership] = await Promise.all([
    socialVisibleIds([personId]),
    getMembershipRef(personId),
  ]);
  if (!visible.has(personId) || !canParticipate(membership?.status)) return null;
  const weekStart = leagueWeekOf(dayKeyFor(now));
  const tier = await ensureStanding(personId, weekStart);
  const db = getDb();
  const [peers, previous] = await Promise.all([
    db
      .select({ personId: leagueStanding.personId })
      .from(leagueStanding)
      .where(and(eq(leagueStanding.weekStart, weekStart), eq(leagueStanding.tier, tier))),
    db
      .select({ tier: leagueStanding.tier })
      .from(leagueStanding)
      .where(
        and(
          eq(leagueStanding.personId, personId),
          eq(leagueStanding.weekStart, addDays(weekStart, -7)),
        ),
      ),
  ]);
  const shown = await socialVisibleIds(peers.map((row) => row.personId));
  const ids = peers.map((row) => row.personId).filter((id) => shown.has(id));
  const [points, people] = await Promise.all([weekPoints(ids, weekStart), getPeopleByIds(ids)]);
  const table = leagueTable(
    ids.map((id) => ({ personId: id, tier, points: points.get(id) ?? 0 })),
  ).map((row) => ({
    personId: row.personId,
    name: people.get(row.personId)?.fullName?.trim() ?? "",
    points: row.points,
    me: row.personId === personId,
  }));
  return {
    weekStart,
    tier,
    promoted: promoted(previous[0]?.tier ?? null, tier),
    myPoints: points.get(personId) ?? 0,
    table,
  };
}

/**
 * Cierra la semana anterior (ADR-178 regla 3): con los puntos de esa semana, decide la liga de cada
 * persona para la semana actual. Es idempotente: una liga ya puesta para esta semana no se toca.
 */
export async function closeLeagueWeek(now = new Date()): Promise<{ moved: number }> {
  const weekStart = leagueWeekOf(dayKeyFor(now));
  const previousWeek = addDays(weekStart, -7);
  const rows = await getDb()
    .select({ personId: leagueStanding.personId, tier: leagueStanding.tier })
    .from(leagueStanding)
    .where(eq(leagueStanding.weekStart, previousWeek));
  if (rows.length === 0) return { moved: 0 };
  const visible = await socialVisibleIds(rows.map((row) => row.personId));
  const stillIn = rows.filter((row) => visible.has(row.personId));
  const points = await weekPoints(
    stillIn.map((row) => row.personId),
    previousWeek,
  );
  const standings: LeagueRow[] = stillIn.map((row) => ({
    personId: row.personId,
    tier: row.tier,
    points: points.get(row.personId) ?? 0,
  }));
  const next = nextTiers(standings);
  if (next.size === 0) return { moved: 0 };
  const inserted = await getDb()
    .insert(leagueStanding)
    .values([...next].map(([personId, tier]) => ({ personId, weekStart, tier })))
    .onConflictDoNothing()
    .returning({ personId: leagueStanding.personId });
  return { moved: inserted.length };
}

/** Al anonimizar a la persona se van sus ligas (ADR-175 regla 4). */
export async function deleteLeagueStandingsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(leagueStanding)
    .where(eq(leagueStanding.personId, personId))
    .returning({ id: leagueStanding.id });
  return rows.length;
}
