import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  competition,
  competitionBase,
  competitionMatchup,
  competitionPowerGrant,
  competitionPowerUse,
  competitionResult,
  competitionRotation,
  competitionTeam,
} from "../schema";
import {
  finishedDays,
  type GrantState,
  grantState,
  isCompleteSplit,
  POWER_TYPES,
  type Power,
  type PowerEffect,
  type PowerNoticeState,
  type PowerSide,
  powerNotices,
  resolvePowers,
} from "./powers-pure";
import { type BaseKind, OUTCOMES, type Outcome } from "./scoring-pure";

// Lecturas de los poderes de The Games (ADR-098): la pantalla del líder de base, el panel de Poderes y
// las tarjetas del equipo en el hub. Ninguna lleva datos personales.

async function rotationsOf(competitionId: string) {
  const db = getDb();
  const [row] = await db
    .select({ status: competition.status })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1);
  const rotations = await db
    .select({ day: competitionRotation.day, status: competitionRotation.status })
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, competitionId));
  return finishedDays(row?.status ?? "LIVE", rotations);
}

/** El efecto de cada uso en el resultado vigente de su base, si ya lo hay. */
async function effectsOf(uses: ReadonlyArray<{ rotationId: string; teamId: string }>) {
  const db = getDb();
  const rotationIds = [...new Set(uses.map((use) => use.rotationId))];
  const effects = new Map<string, PowerEffect>();
  if (rotationIds.length === 0) return effects;
  const results = await db
    .select({ detail: competitionResult.powerDetail })
    .from(competitionResult)
    .innerJoin(competitionMatchup, eq(competitionMatchup.id, competitionResult.matchupId))
    .where(
      and(
        inArray(competitionMatchup.rotationId, rotationIds),
        isNull(competitionResult.supersededAt),
      ),
    );
  for (const { detail } of results) {
    for (const use of detail?.uses ?? []) effects.set(use.useId, use.effect);
  }
  return effects;
}

// --- Pantalla del líder de base ------------------------------------------------------------------

export interface JudgeMatchupPowers {
  /** Los poderes registrados, con cómo están antes del resultado. */
  uses: Array<{
    id: string;
    side: PowerSide;
    power: Power;
    receivedAt: Date;
    state: PowerNoticeState;
  }>;
  /** Las tarjetas entregadas y sin usar de cada equipo para la jornada, por poder. */
  available: Record<PowerSide, Array<{ power: Power; count: number }>>;
  /** El resultado oficial y los puntos que daría cada botón, si hay poderes registrados. */
  preview: Record<Outcome, { official: Outcome; points: { a: number; b: number } }> | null;
}

/** Los poderes de los enfrentamientos de una rotación que ve un líder. */
export async function judgePowers(
  rotation: { id: string; day: number },
  matchups: ReadonlyArray<{
    id: string;
    baseKind: BaseKind;
    teamAId: string;
    teamBId: string;
  }>,
): Promise<Map<string, JudgeMatchupPowers>> {
  const view = new Map<string, JudgeMatchupPowers>();
  if (matchups.length === 0) return view;
  const db = getDb();
  const teamIds = matchups.flatMap((matchup) => [matchup.teamAId, matchup.teamBId]);
  const uses = await db
    .select({
      id: competitionPowerUse.id,
      teamId: competitionPowerUse.teamId,
      power: competitionPowerGrant.power,
      receivedAt: competitionPowerUse.createdAt,
    })
    .from(competitionPowerUse)
    .innerJoin(competitionPowerGrant, eq(competitionPowerGrant.id, competitionPowerUse.grantId))
    .where(
      and(
        eq(competitionPowerUse.rotationId, rotation.id),
        eq(competitionPowerUse.status, "ACTIVE"),
        inArray(competitionPowerUse.teamId, teamIds),
      ),
    )
    .orderBy(asc(competitionPowerUse.createdAt), asc(competitionPowerUse.id));
  const delivered = await db
    .select({
      id: competitionPowerGrant.id,
      teamId: competitionPowerGrant.teamId,
      power: competitionPowerGrant.power,
    })
    .from(competitionPowerGrant)
    .where(
      and(
        inArray(competitionPowerGrant.teamId, teamIds),
        eq(competitionPowerGrant.day, rotation.day),
        eq(competitionPowerGrant.status, "DELIVERED"),
      ),
    );
  const usedGrants = delivered.length
    ? await db
        .select({ grantId: competitionPowerUse.grantId })
        .from(competitionPowerUse)
        .where(
          and(
            inArray(
              competitionPowerUse.grantId,
              delivered.map((grant) => grant.id),
            ),
            eq(competitionPowerUse.status, "ACTIVE"),
          ),
        )
    : [];
  const used = new Set(usedGrants.map((row) => row.grantId));
  const availableOf = (teamId: string) =>
    POWER_TYPES.flatMap((power) => {
      const count = delivered.filter(
        (grant) => grant.teamId === teamId && grant.power === power && !used.has(grant.id),
      ).length;
      return count > 0 ? [{ power, count }] : [];
    });
  for (const matchup of matchups) {
    const own = uses
      .filter((use) => use.teamId === matchup.teamAId || use.teamId === matchup.teamBId)
      .map((use) => ({
        id: use.id,
        side: use.teamId === matchup.teamAId ? ("A" as const) : ("B" as const),
        power: use.power,
        receivedAt: use.receivedAt,
      }));
    const notices = powerNotices(matchup.baseKind, own);
    const preview =
      own.length > 0
        ? (Object.fromEntries(
            OUTCOMES.map((outcome) => {
              const resolution = resolvePowers({ baseKind: matchup.baseKind, outcome, uses: own });
              return [outcome, { official: resolution.official, points: resolution.points }];
            }),
          ) as JudgeMatchupPowers["preview"])
        : null;
    view.set(matchup.id, {
      uses: own.map((use, index) => ({ ...use, state: notices[index]?.state ?? "ACTIVE" })),
      available: { A: availableOf(matchup.teamAId), B: availableOf(matchup.teamBId) },
      preview,
    });
  }
  return view;
}

// --- Panel de Poderes ----------------------------------------------------------------------------

export interface PowerBoardGrant {
  id: string;
  power: Power;
  day: 1 | 2;
  status: "ASSIGNED" | "DELIVERED" | "VOIDED";
  state: GrantState;
  deliveredAt: Date | null;
  voidReason: string | null;
}

export interface PowerBoardTeam {
  id: string;
  number: number;
  name: string;
  color: string | null;
  grants: PowerBoardGrant[];
  dayOne: number;
  dayTwo: number;
  delivered: number;
  complete: boolean;
}

export interface PowerBoardUse {
  id: string;
  day: number;
  rotation: number;
  base: string;
  team: { number: number; name: string };
  power: Power;
  status: "ACTIVE" | "REVERTED";
  receivedAt: Date;
  revertReason: string | null;
  /** El efecto en el resultado vigente; `null` si la base todavía no tiene resultado. */
  effect: PowerEffect | null;
}

export interface PowerBoard {
  teams: PowerBoardTeam[];
  uses: PowerBoardUse[];
  totals: { grants: number; delivered: number; completeTeams: number; teams: number };
}

/** El reparto de cada equipo con el estado de sus tarjetas y los poderes registrados. */
export async function listPowerBoard(competitionId: string): Promise<PowerBoard> {
  const db = getDb();
  const teams = await db
    .select({
      id: competitionTeam.id,
      number: competitionTeam.number,
      name: competitionTeam.name,
      color: competitionTeam.color,
    })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.number));
  const grants = await db
    .select()
    .from(competitionPowerGrant)
    .where(eq(competitionPowerGrant.competitionId, competitionId))
    .orderBy(asc(competitionPowerGrant.day), asc(competitionPowerGrant.createdAt));
  const uses = await db
    .select({
      id: competitionPowerUse.id,
      grantId: competitionPowerUse.grantId,
      rotationId: competitionPowerUse.rotationId,
      teamId: competitionPowerUse.teamId,
      status: competitionPowerUse.status,
      receivedAt: competitionPowerUse.createdAt,
      revertReason: competitionPowerUse.revertReason,
      power: competitionPowerGrant.power,
      day: competitionRotation.day,
      rotation: competitionRotation.number,
      base: competitionBase.name,
    })
    .from(competitionPowerUse)
    .innerJoin(competitionPowerGrant, eq(competitionPowerGrant.id, competitionPowerUse.grantId))
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionPowerUse.rotationId))
    .innerJoin(competitionBase, eq(competitionBase.id, competitionPowerUse.baseId))
    .where(eq(competitionPowerUse.competitionId, competitionId))
    .orderBy(
      asc(competitionRotation.day),
      asc(competitionRotation.number),
      asc(competitionPowerUse.createdAt),
    );
  const finished = await rotationsOf(competitionId);
  const effects = await effectsOf(uses.filter((use) => use.status === "ACTIVE"));
  const activeUse = new Set(
    uses.filter((use) => use.status === "ACTIVE").map((use) => use.grantId),
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const board = teams.map((team): PowerBoardTeam => {
    const own = grants
      .filter((grant) => grant.teamId === team.id)
      .map(
        (grant): PowerBoardGrant => ({
          id: grant.id,
          power: grant.power,
          day: grant.day === 2 ? 2 : 1,
          status: grant.status,
          state: grantState(grant, activeUse.has(grant.id), finished),
          deliveredAt: grant.deliveredAt,
          voidReason: grant.voidReason,
        }),
      );
    const active = own.filter((grant) => grant.status !== "VOIDED");
    const dayOne = active.filter((grant) => grant.day === 1).length;
    const dayTwo = active.filter((grant) => grant.day === 2).length;
    return {
      ...team,
      grants: own,
      dayOne,
      dayTwo,
      delivered: active.filter((grant) => grant.status === "DELIVERED").length,
      complete: isCompleteSplit(dayOne, dayTwo),
    };
  });
  return {
    teams: board,
    uses: uses.map((use) => {
      const team = teamById.get(use.teamId);
      return {
        id: use.id,
        day: use.day,
        rotation: use.rotation,
        base: use.base,
        team: { number: team?.number ?? 0, name: team?.name ?? "" },
        power: use.power,
        status: use.status,
        receivedAt: use.receivedAt,
        revertReason: use.revertReason,
        effect: use.status === "ACTIVE" ? (effects.get(use.id) ?? null) : null,
      };
    }),
    totals: {
      grants: board.reduce((sum, team) => sum + team.dayOne + team.dayTwo, 0),
      delivered: board.reduce((sum, team) => sum + team.delivered, 0),
      completeTeams: board.filter((team) => team.complete).length,
      teams: board.length,
    },
  };
}

// --- Hub de capitanes ----------------------------------------------------------------------------

export interface TeamPower {
  power: Power;
  day: 1 | 2;
  status: Exclude<GrantState, "VOIDED">;
  use: {
    rotation: number;
    base: string;
    rival: { number: number; name: string };
    effect: PowerEffect | "PENDING";
  } | null;
}

/** Las tarjetas de un equipo para su hub (ADR-096 enmendada por ADR-098): sin ids ni las anuladas. */
export async function listTeamPowers(competitionId: string, teamId: string): Promise<TeamPower[]> {
  const db = getDb();
  const grants = await db
    .select({
      id: competitionPowerGrant.id,
      power: competitionPowerGrant.power,
      day: competitionPowerGrant.day,
      status: competitionPowerGrant.status,
    })
    .from(competitionPowerGrant)
    .where(
      and(
        eq(competitionPowerGrant.competitionId, competitionId),
        eq(competitionPowerGrant.teamId, teamId),
        ne(competitionPowerGrant.status, "VOIDED"),
      ),
    )
    .orderBy(asc(competitionPowerGrant.day), asc(competitionPowerGrant.createdAt));
  if (grants.length === 0) return [];
  const uses = await db
    .select({
      id: competitionPowerUse.id,
      grantId: competitionPowerUse.grantId,
      rotationId: competitionPowerUse.rotationId,
      teamId: competitionPowerUse.teamId,
      rotation: competitionRotation.number,
      base: competitionBase.name,
    })
    .from(competitionPowerUse)
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionPowerUse.rotationId))
    .innerJoin(competitionBase, eq(competitionBase.id, competitionPowerUse.baseId))
    .where(
      and(
        inArray(
          competitionPowerUse.grantId,
          grants.map((grant) => grant.id),
        ),
        eq(competitionPowerUse.status, "ACTIVE"),
      ),
    );
  const rivals = uses.length
    ? await db
        .select({
          rotationId: competitionMatchup.rotationId,
          teamAId: competitionMatchup.teamAId,
          teamBId: competitionMatchup.teamBId,
        })
        .from(competitionMatchup)
        .where(
          and(
            inArray(
              competitionMatchup.rotationId,
              uses.map((use) => use.rotationId),
            ),
            or(eq(competitionMatchup.teamAId, teamId), eq(competitionMatchup.teamBId, teamId)),
          ),
        )
    : [];
  const rivalIds = rivals.map((row) => (row.teamAId === teamId ? row.teamBId : row.teamAId));
  const rivalTeams = rivalIds.length
    ? await db
        .select({
          id: competitionTeam.id,
          number: competitionTeam.number,
          name: competitionTeam.name,
        })
        .from(competitionTeam)
        .where(inArray(competitionTeam.id, rivalIds))
    : [];
  const finished = await rotationsOf(competitionId);
  const effects = await effectsOf(uses);
  return grants.map((grant): TeamPower => {
    const use = uses.find((item) => item.grantId === grant.id);
    const matchup = use ? rivals.find((row) => row.rotationId === use.rotationId) : undefined;
    const rivalId = matchup
      ? matchup.teamAId === teamId
        ? matchup.teamBId
        : matchup.teamAId
      : null;
    const rival = rivalTeams.find((team) => team.id === rivalId);
    const state = grantState(grant, use !== undefined, finished);
    return {
      power: grant.power,
      day: grant.day === 2 ? 2 : 1,
      status: state === "VOIDED" ? "ASSIGNED" : state,
      use: use
        ? {
            rotation: use.rotation,
            base: use.base,
            rival: { number: rival?.number ?? 0, name: rival?.name ?? "" },
            effect: effects.get(use.id) ?? "PENDING",
          }
        : null,
    };
  });
}
