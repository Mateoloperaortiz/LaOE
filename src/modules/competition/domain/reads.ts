import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listSubmissions } from "@/modules/forms";
import { getPeopleByIds } from "@/modules/people";
import {
  competition,
  competitionAnnouncement,
  competitionBase,
  competitionBet,
  competitionCreditEntry,
  competitionExtra,
  competitionExtraCriterion,
  competitionExtraScore,
  competitionMarket,
  competitionMarketOption,
  competitionMatchup,
  competitionPointEntry,
  competitionResult,
  competitionRotation,
  competitionStaff,
  competitionTeam,
  competitionTeamCaptain,
} from "../schema";
import { marketState, poolByOption } from "./betting-pure";
import type { PowerDetail } from "./powers-pure";
import { type JudgeMatchupPowers, judgePowers } from "./powers-reads";
import { type RouteStop, toRouteStops } from "./route-pure";
import { type RubricLevel, rubricLevel, rubricTotal } from "./rubric-pure";
import type { Day, ScheduleRotation } from "./schedule-pure";
import type { BaseKind, Outcome } from "./scoring-pure";
import { computeStandings, type StandingRow } from "./standings-pure";

// Lecturas de The Games para el área de administración y la vitrina. Quién puede leer qué lo decide
// src/app; aquí no hay datos personales salvo el nombre del personal asignado y el nombre y el
// celular de los capitanes (ADR-095).

/** La clave del campo del formulario de inscripción que lleva el nombre del equipo. */
export const TEAM_NAME_FIELD = "equipo";

export type CompetitionRow = typeof competition.$inferSelect;

export async function getCompetition(id: string): Promise<CompetitionRow | null> {
  const [row] = await getDb().select().from(competition).where(eq(competition.id, id)).limit(1);
  return row ?? null;
}

export async function getCompetitionBySlug(slug: string): Promise<CompetitionRow | null> {
  const [row] = await getDb().select().from(competition).where(eq(competition.slug, slug)).limit(1);
  return row ?? null;
}

export async function listCompetitions(): Promise<CompetitionRow[]> {
  return getDb().select().from(competition).orderBy(desc(competition.createdAt));
}

export interface TeamRow {
  id: string;
  number: number;
  name: string;
  color: string | null;
  status: "ACTIVE" | "WITHDRAWN";
  submissionId: string | null;
  hasCode: boolean;
  codeLocked: boolean;
  /** La versión de las instrucciones del hub que aceptó el equipo, y cuándo (ADR-099). */
  hubTermsVersion: number | null;
  hubTermsAcceptedAt: Date | null;
}

export async function listTeams(competitionId: string, now = new Date()): Promise<TeamRow[]> {
  const rows = await getDb()
    .select()
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.number));
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    color: row.color,
    status: row.status,
    submissionId: row.submissionId,
    hasCode: row.codeHash !== null,
    codeLocked: row.codeLockedUntil !== null && row.codeLockedUntil > now,
    hubTermsVersion: row.hubTermsVersion,
    hubTermsAcceptedAt: row.hubTermsAcceptedAt,
  }));
}

export interface CaptainRow {
  teamId: string;
  position: number;
  name: string;
  phone: string | null;
}

/** Los capitanes con su celular (ADR-095), por número de equipo y puesto. Solo para la operación de
 *  la competencia: nunca para la vitrina. */
export async function listCaptains(competitionId: string): Promise<CaptainRow[]> {
  return getDb()
    .select({
      teamId: competitionTeamCaptain.teamId,
      position: competitionTeamCaptain.position,
      name: competitionTeamCaptain.name,
      phone: competitionTeamCaptain.phone,
    })
    .from(competitionTeamCaptain)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionTeamCaptain.teamId))
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.number), asc(competitionTeamCaptain.position));
}

/** Solo los nombres de los capitanes, para la vitrina: el celular no se lee. */
export async function listCaptainNames(
  competitionId: string,
): Promise<Array<Omit<CaptainRow, "phone">>> {
  return getDb()
    .select({
      teamId: competitionTeamCaptain.teamId,
      position: competitionTeamCaptain.position,
      name: competitionTeamCaptain.name,
    })
    .from(competitionTeamCaptain)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionTeamCaptain.teamId))
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.number), asc(competitionTeamCaptain.position));
}

export interface RegistrationCandidate {
  submissionId: string;
  teamName: string;
  createdAt: Date;
  teamId: string | null;
}

/** Las respuestas del formulario de inscripción con el nombre del equipo y si ya tienen equipo. Sin
 *  correos ni nombres de personas: eso se consulta en el formulario, que es de ADMIN. */
export async function listRegistrationCandidates(
  competitionId: string,
): Promise<RegistrationCandidate[]> {
  const row = await getCompetition(competitionId);
  if (!row?.registrationFormId) return [];
  const { rows } = await listSubmissions({
    formId: row.registrationFormId,
    q: "",
    page: 1,
    pageSize: 500,
  });
  const linked = await getDb()
    .select({ id: competitionTeam.id, submissionId: competitionTeam.submissionId })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const bySubmission = new Map(linked.map((team) => [team.submissionId, team.id]));
  return rows.map((submission) => {
    const answer = submission.answers[TEAM_NAME_FIELD];
    return {
      submissionId: submission.id,
      teamName: typeof answer === "string" ? answer.trim() : "",
      createdAt: submission.createdAt,
      teamId: bySubmission.get(submission.id) ?? null,
    };
  });
}

export type BaseRow = typeof competitionBase.$inferSelect;

export async function listBases(competitionId: string): Promise<BaseRow[]> {
  return getDb()
    .select()
    .from(competitionBase)
    .where(eq(competitionBase.competitionId, competitionId))
    .orderBy(asc(competitionBase.day), asc(competitionBase.orderIndex));
}

export interface StaffRow {
  id: string;
  personId: string;
  fullName: string;
  role: "OPERATOR" | "JUDGE";
  baseId: string | null;
}

export async function listStaff(competitionId: string): Promise<StaffRow[]> {
  const rows = await getDb()
    .select()
    .from(competitionStaff)
    .where(eq(competitionStaff.competitionId, competitionId))
    .orderBy(asc(competitionStaff.createdAt));
  const people = await getPeopleByIds(rows.map((row) => row.personId));
  return rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    fullName: people.get(row.personId)?.fullName ?? "",
    role: row.role,
    baseId: row.baseId,
  }));
}

/** Para «Mis datos»: dónde está asignada una persona (ADR-089, consecuencias). */
export async function listStaffFor(personId: string) {
  return getDb()
    .select({
      competition: competition.name,
      role: competitionStaff.role,
      base: competitionBase.name,
      createdAt: competitionStaff.createdAt,
    })
    .from(competitionStaff)
    .innerJoin(competition, eq(competition.id, competitionStaff.competitionId))
    .leftJoin(competitionBase, eq(competitionBase.id, competitionStaff.baseId))
    .where(eq(competitionStaff.personId, personId));
}

// --- Rotaciones y enfrentamientos ----------------------------------------------------------------

export type RotationRow = typeof competitionRotation.$inferSelect;

export interface MatchupView {
  id: string;
  rotationId: string;
  base: { id: string; name: string; kind: BaseKind; location: string | null; orderIndex: number };
  teamA: { id: string; number: number; name: string; color: string | null };
  teamB: { id: string; number: number; name: string; color: string | null };
  /** El resultado de la cancha. */
  outcome: Outcome | null;
  /** El resultado oficial: con poderes puede diferir del de la cancha (ADR-098). */
  official: Outcome | null;
  /** Con poderes, el desglose del resultado vigente. */
  powerDetail: PowerDetail | null;
  /** Cuándo empezó la base (ADR-098 regla 4). */
  startedAt: Date | null;
  notes: string;
}

export interface RotationView extends RotationRow {
  matchups: MatchupView[];
}

async function matchupsOf(rotationIds: string[]): Promise<MatchupView[]> {
  if (rotationIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ matchup: competitionMatchup, base: competitionBase })
    .from(competitionMatchup)
    .innerJoin(competitionBase, eq(competitionBase.id, competitionMatchup.baseId))
    .where(inArray(competitionMatchup.rotationId, rotationIds))
    .orderBy(asc(competitionBase.orderIndex));
  const teamIds = [...new Set(rows.flatMap((row) => [row.matchup.teamAId, row.matchup.teamBId]))];
  const teams = teamIds.length
    ? await db.select().from(competitionTeam).where(inArray(competitionTeam.id, teamIds))
    : [];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const results = rows.length
    ? await db
        .select()
        .from(competitionResult)
        .where(
          and(
            inArray(
              competitionResult.matchupId,
              rows.map((row) => row.matchup.id),
            ),
            isNull(competitionResult.supersededAt),
          ),
        )
    : [];
  const resultByMatchup = new Map(results.map((result) => [result.matchupId, result]));
  const teamView = (id: string) => {
    const team = teamById.get(id);
    return {
      id,
      number: team?.number ?? 0,
      name: team?.name ?? "",
      color: team?.color ?? null,
    };
  };
  return rows.map(({ matchup, base }) => {
    const result = resultByMatchup.get(matchup.id);
    return {
      id: matchup.id,
      rotationId: matchup.rotationId,
      base: {
        id: base.id,
        name: base.name,
        kind: base.kind,
        location: base.location,
        orderIndex: base.orderIndex,
      },
      teamA: teamView(matchup.teamAId),
      teamB: teamView(matchup.teamBId),
      outcome: result?.outcome ?? null,
      official: result ? (result.officialOutcome ?? result.outcome) : null,
      powerDetail: result?.powerDetail ?? null,
      startedAt: matchup.startedAt,
      notes: result?.notes ?? "",
    };
  });
}

/** Las paradas de un equipo en las dos jornadas (ADR-097): solo sus enfrentamientos, con el rival y
 *  el resultado vigente. */
export async function listRouteStops(competitionId: string, teamId: string): Promise<RouteStop[]> {
  const db = getDb();
  const rows = await db
    .select({
      matchup: competitionMatchup,
      base: competitionBase,
      rotation: {
        id: competitionRotation.id,
        day: competitionRotation.day,
        number: competitionRotation.number,
        status: competitionRotation.status,
      },
    })
    .from(competitionMatchup)
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
    .innerJoin(competitionBase, eq(competitionBase.id, competitionMatchup.baseId))
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        or(eq(competitionMatchup.teamAId, teamId), eq(competitionMatchup.teamBId, teamId)),
      ),
    );
  if (rows.length === 0) return [];
  const teamIds = [...new Set(rows.flatMap((row) => [row.matchup.teamAId, row.matchup.teamBId]))];
  const teams = await db.select().from(competitionTeam).where(inArray(competitionTeam.id, teamIds));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const results = await db
    .select({
      matchupId: competitionResult.matchupId,
      outcome: competitionResult.outcome,
      official: competitionResult.officialOutcome,
      detail: competitionResult.powerDetail,
    })
    .from(competitionResult)
    .where(
      and(
        inArray(
          competitionResult.matchupId,
          rows.map((row) => row.matchup.id),
        ),
        isNull(competitionResult.supersededAt),
      ),
    );
  const resultOf = new Map(results.map((result) => [result.matchupId, result]));
  const teamView = (id: string) => {
    const team = teamById.get(id);
    return { id, number: team?.number ?? 0, name: team?.name ?? "", color: team?.color ?? null };
  };
  return toRouteStops({
    teamId,
    rotations: rows.map((row) => row.rotation),
    matchups: rows.map(({ matchup, base }) => ({
      rotationId: matchup.rotationId,
      base: { name: base.name, kind: base.kind, location: base.location },
      teamA: teamView(matchup.teamAId),
      teamB: teamView(matchup.teamBId),
      outcome: resultOf.get(matchup.id)?.outcome ?? null,
      official: resultOf.get(matchup.id)?.official ?? null,
      points: (() => {
        const detail = resultOf.get(matchup.id)?.detail;
        return detail ? { a: detail.teams.A.total, b: detail.teams.B.total } : null;
      })(),
    })),
  });
}

export interface RotationSummary extends RotationRow {
  matchupCount: number;
  resultCount: number;
}

export async function listRotations(competitionId: string): Promise<RotationSummary[]> {
  const db = getDb();
  const rotations = await db
    .select()
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, competitionId))
    .orderBy(asc(competitionRotation.day), asc(competitionRotation.number));
  if (rotations.length === 0) return [];
  const counts = await db
    .select({
      rotationId: competitionMatchup.rotationId,
      matchups: sql<number>`count(*)::int`,
      results: sql<number>`count(${competitionResult.id})::int`,
    })
    .from(competitionMatchup)
    .leftJoin(
      competitionResult,
      and(
        eq(competitionResult.matchupId, competitionMatchup.id),
        isNull(competitionResult.supersededAt),
      ),
    )
    .where(
      inArray(
        competitionMatchup.rotationId,
        rotations.map((rotation) => rotation.id),
      ),
    )
    .groupBy(competitionMatchup.rotationId);
  const byRotation = new Map(counts.map((row) => [row.rotationId, row]));
  return rotations.map((rotation) => ({
    ...rotation,
    matchupCount: byRotation.get(rotation.id)?.matchups ?? 0,
    resultCount: byRotation.get(rotation.id)?.results ?? 0,
  }));
}

export async function getRotation(
  competitionId: string,
  rotationId: string,
): Promise<RotationView | null> {
  const [rotation] = await getDb()
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.id, rotationId),
        eq(competitionRotation.competitionId, competitionId),
      ),
    )
    .limit(1);
  if (!rotation) return null;
  return { ...rotation, matchups: await matchupsOf([rotation.id]) };
}

/** La rotación en curso y la siguiente pendiente, con sus enfrentamientos. */
export async function getLiveRotations(
  competitionId: string,
): Promise<{ current: RotationView | null; next: RotationView | null }> {
  const db = getDb();
  const [current] = await db
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.status, "ACTIVE"),
      ),
    )
    .limit(1);
  const [next] = await db
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.status, "PENDING"),
      ),
    )
    .orderBy(asc(competitionRotation.day), asc(competitionRotation.number))
    .limit(1);
  const ids = [current?.id, next?.id].filter((id): id is string => Boolean(id));
  const matchups = await matchupsOf(ids);
  const view = (rotation: RotationRow | undefined) =>
    rotation
      ? { ...rotation, matchups: matchups.filter((item) => item.rotationId === rotation.id) }
      : null;
  return { current: view(current), next: view(next) };
}

/** Enfrentamientos de rotaciones ya cerradas que siguen sin resultado. */
export async function listPendingMatchups(competitionId: string): Promise<MatchupView[]> {
  const closed = await getDb()
    .select({ id: competitionRotation.id })
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.status, "CLOSED"),
      ),
    );
  const matchups = await matchupsOf(closed.map((rotation) => rotation.id));
  return matchups.filter((matchup) => matchup.outcome === null);
}

/** El calendario completo como lo lee el validador y los mapas de calor. */
export async function getScheduleForValidation(competitionId: string) {
  const db = getDb();
  const rotations = await db
    .select()
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, competitionId));
  const matchups = rotations.length
    ? await db
        .select()
        .from(competitionMatchup)
        .where(
          inArray(
            competitionMatchup.rotationId,
            rotations.map((rotation) => rotation.id),
          ),
        )
    : [];
  const teams = await listTeams(competitionId);
  const bases = await listBases(competitionId);
  return {
    rotations: rotations.map(
      (rotation): ScheduleRotation => ({
        id: rotation.id,
        day: rotation.day as Day,
        number: rotation.number,
        matchups: matchups.filter((matchup) => matchup.rotationId === rotation.id),
      }),
    ),
    teams: teams.map((team) => ({
      id: team.id,
      number: team.number,
      active: team.status === "ACTIVE",
    })),
    bases: bases.map((base) => ({ id: base.id, day: base.day as Day })),
  };
}

// --- Posiciones, extras y libro ------------------------------------------------------------------

export interface Standings {
  overall: StandingRow[];
  day1: StandingRow[];
  day2: StandingRow[];
}

export async function listStandings(competitionId: string): Promise<Standings> {
  const db = getDb();
  const teams = await listTeams(competitionId);
  const points = await db
    .select({
      teamId: competitionPointEntry.teamId,
      day: competitionPointEntry.day,
      points: sql<number>`sum(${competitionPointEntry.points})::int`,
    })
    .from(competitionPointEntry)
    .where(eq(competitionPointEntry.competitionId, competitionId))
    .groupBy(competitionPointEntry.teamId, competitionPointEntry.day);
  const results = await db
    .select({
      day: competitionRotation.day,
      teamAId: competitionMatchup.teamAId,
      teamBId: competitionMatchup.teamBId,
      // Ganados, empatados y perdidos cuentan con el resultado oficial (ADR-098 regla 5).
      outcome: sql<Outcome>`coalesce(${competitionResult.officialOutcome}, ${competitionResult.outcome})`,
    })
    .from(competitionResult)
    .innerJoin(competitionMatchup, eq(competitionMatchup.id, competitionResult.matchupId))
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        isNull(competitionResult.supersededAt),
      ),
    );
  const standingsTeams = teams.map((team) => ({
    id: team.id,
    number: team.number,
    name: team.name,
    color: team.color,
    active: team.status === "ACTIVE",
  }));
  const pointRows = points.map((row) => ({ ...row, day: row.day as Day }));
  const resultRows = results.map((row) => ({ ...row, day: row.day as Day }));
  return {
    overall: computeStandings(standingsTeams, pointRows, resultRows, "overall"),
    day1: computeStandings(standingsTeams, pointRows, resultRows, 1),
    day2: computeStandings(standingsTeams, pointRows, resultRows, 2),
  };
}

export interface ExtraRubricTeam {
  /** Una nota por criterio, en el orden de la rúbrica; `null` si falta. */
  scores: Array<number | null>;
  total: number | null;
  level: RubricLevel | null;
}

export interface ExtraView {
  id: string;
  name: string;
  day: Day;
  totals: Map<string, number>;
  /** Con rúbrica: sus criterios, la escala y las notas de cada equipo. */
  rubric: {
    scale: number;
    criteria: Array<{ id: string; name: string; weight: number }>;
    teams: Map<string, ExtraRubricTeam>;
  } | null;
}

export async function listExtras(competitionId: string): Promise<ExtraView[]> {
  const db = getDb();
  const extras = await db
    .select()
    .from(competitionExtra)
    .where(eq(competitionExtra.competitionId, competitionId))
    .orderBy(asc(competitionExtra.day), asc(competitionExtra.createdAt));
  if (extras.length === 0) return [];
  const ids = extras.map((extra) => extra.id);
  const totals = await db
    .select({
      extraId: competitionPointEntry.extraId,
      teamId: competitionPointEntry.teamId,
      total: sql<number>`sum(${competitionPointEntry.points})::int`,
    })
    .from(competitionPointEntry)
    .where(inArray(competitionPointEntry.extraId, ids))
    .groupBy(competitionPointEntry.extraId, competitionPointEntry.teamId);
  const criteria = await db
    .select()
    .from(competitionExtraCriterion)
    .where(inArray(competitionExtraCriterion.extraId, ids))
    .orderBy(asc(competitionExtraCriterion.orderIndex));
  const scores = criteria.length
    ? await db
        .select()
        .from(competitionExtraScore)
        .where(
          inArray(
            competitionExtraScore.criterionId,
            criteria.map((criterion) => criterion.id),
          ),
        )
    : [];
  return extras.map((extra) => {
    const own = criteria.filter((criterion) => criterion.extraId === extra.id);
    let rubric: ExtraView["rubric"] = null;
    if (extra.rubricScale !== null) {
      const teams = new Map<string, ExtraRubricTeam>();
      const teamIds = new Set(
        scores
          .filter((score) => own.some((criterion) => criterion.id === score.criterionId))
          .map((score) => score.teamId),
      );
      for (const teamId of teamIds) {
        const values = own.map(
          (criterion) =>
            scores.find((score) => score.criterionId === criterion.id && score.teamId === teamId)
              ?.score ?? null,
        );
        const total = rubricTotal(own, values);
        teams.set(teamId, {
          scores: values,
          total,
          level: total === null ? null : rubricLevel(total),
        });
      }
      rubric = {
        scale: extra.rubricScale,
        criteria: own.map(({ id, name, weight }) => ({ id, name, weight })),
        teams,
      };
    }
    return {
      id: extra.id,
      name: extra.name,
      day: extra.day as Day,
      totals: new Map(
        totals.filter((row) => row.extraId === extra.id).map((row) => [row.teamId, row.total]),
      ),
      rubric,
    };
  });
}

export async function listLedger(competitionId: string, limit = 200) {
  return getDb()
    .select({
      id: competitionPointEntry.id,
      teamId: competitionPointEntry.teamId,
      teamNumber: competitionTeam.number,
      teamName: competitionTeam.name,
      day: competitionPointEntry.day,
      kind: competitionPointEntry.kind,
      points: competitionPointEntry.points,
      reason: competitionPointEntry.reason,
      createdAt: competitionPointEntry.createdAt,
    })
    .from(competitionPointEntry)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionPointEntry.teamId))
    .where(eq(competitionPointEntry.competitionId, competitionId))
    .orderBy(desc(competitionPointEntry.createdAt))
    .limit(limit);
}

export type AnnouncementRow = typeof competitionAnnouncement.$inferSelect;

export async function listAnnouncements(
  competitionId: string,
  onlyActive = false,
): Promise<AnnouncementRow[]> {
  return getDb()
    .select()
    .from(competitionAnnouncement)
    .where(
      and(
        eq(competitionAnnouncement.competitionId, competitionId),
        ...(onlyActive ? [eq(competitionAnnouncement.active, true)] : []),
      ),
    )
    .orderBy(desc(competitionAnnouncement.createdAt));
}

// --- Juez ----------------------------------------------------------------------------------------

/** Lo que ve un juez: sus bases, los enfrentamientos de la rotación en curso en ellas y, en cada uno,
 *  los poderes registrados y las tarjetas disponibles (ADR-098). */
export async function judgeView(competitionId: string, personId: string) {
  const db = getDb();
  const own = await db
    .select({ baseId: competitionStaff.baseId })
    .from(competitionStaff)
    .where(
      and(
        eq(competitionStaff.competitionId, competitionId),
        eq(competitionStaff.personId, personId),
      ),
    );
  const baseIds = own.flatMap((row) => (row.baseId ? [row.baseId] : []));
  const bases = baseIds.length
    ? await db.select().from(competitionBase).where(inArray(competitionBase.id, baseIds))
    : [];
  const { current, next } = await getLiveRotations(competitionId);
  const mine = (rotation: RotationView | null) =>
    rotation ? rotation.matchups.filter((matchup) => baseIds.includes(matchup.base.id)) : [];
  const currentMatchups = mine(current);
  const powers: Map<string, JudgeMatchupPowers> = current
    ? await judgePowers(
        current,
        currentMatchups.map((matchup) => ({
          id: matchup.id,
          baseKind: matchup.base.kind,
          teamAId: matchup.teamA.id,
          teamBId: matchup.teamB.id,
        })),
      )
    : new Map();
  return { bases, current, next, currentMatchups, nextMatchups: mine(next), powers };
}

// --- Apuestas ------------------------------------------------------------------------------------

export interface MarketView {
  id: string;
  title: string;
  status: (typeof competitionMarket.$inferSelect)["status"];
  closesAt: Date | null;
  matchupId: string | null;
  winnerTeamId: string | null;
  options: string[];
  pools: Map<string, number>;
  bets: Array<{ id: string; teamId: string; pickTeamId: string; stake: number; createdAt: Date }>;
}

export async function listMarkets(competitionId: string, now = new Date()): Promise<MarketView[]> {
  const db = getDb();
  const markets = await db
    .select()
    .from(competitionMarket)
    .where(eq(competitionMarket.competitionId, competitionId))
    .orderBy(desc(competitionMarket.createdAt));
  if (markets.length === 0) return [];
  const ids = markets.map((market) => market.id);
  const options = await db
    .select()
    .from(competitionMarketOption)
    .where(inArray(competitionMarketOption.marketId, ids));
  const bets = await db.select().from(competitionBet).where(inArray(competitionBet.marketId, ids));
  return markets.map((market) => {
    const own = bets.filter((bet) => bet.marketId === market.id);
    return {
      id: market.id,
      title: market.title,
      status: marketState(market, now),
      closesAt: market.closesAt,
      matchupId: market.matchupId,
      winnerTeamId: market.winnerTeamId,
      options: options.filter((option) => option.marketId === market.id).map((o) => o.teamId),
      pools: poolByOption(own),
      bets: own.map(({ id, teamId, pickTeamId, stake, createdAt }) => ({
        id,
        teamId,
        pickTeamId,
        stake,
        createdAt,
      })),
    };
  });
}

/** Lo que recibió cada apuesta de un equipo: el pago si acertó o la devolución (ADR-091). Para el hub
 *  de capitanes (ADR-096), que solo muestra las apuestas del propio equipo. */
export async function listTeamBetReturns(
  competitionId: string,
  teamId: string,
): Promise<Map<string, { kind: "PAYOUT" | "REFUND"; amount: number }>> {
  const rows = await getDb()
    .select({
      betId: competitionCreditEntry.betId,
      kind: competitionCreditEntry.kind,
      amount: competitionCreditEntry.amount,
    })
    .from(competitionCreditEntry)
    .where(
      and(
        eq(competitionCreditEntry.competitionId, competitionId),
        eq(competitionCreditEntry.teamId, teamId),
        inArray(competitionCreditEntry.kind, ["PAYOUT", "REFUND"]),
      ),
    );
  const returns = new Map<string, { kind: "PAYOUT" | "REFUND"; amount: number }>();
  for (const row of rows) {
    if (row.betId && (row.kind === "PAYOUT" || row.kind === "REFUND")) {
      returns.set(row.betId, { kind: row.kind, amount: row.amount });
    }
  }
  return returns;
}

export async function creditBalances(competitionId: string): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      teamId: competitionCreditEntry.teamId,
      total: sql<number>`sum(${competitionCreditEntry.amount})::int`,
    })
    .from(competitionCreditEntry)
    .where(eq(competitionCreditEntry.competitionId, competitionId))
    .groupBy(competitionCreditEntry.teamId);
  return new Map(rows.map((row) => [row.teamId, row.total]));
}
