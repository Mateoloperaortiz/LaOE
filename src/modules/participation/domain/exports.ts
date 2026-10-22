import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getPeopleByIds } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import type { ChallengeKind, ParticipationStatus } from "../gamification-types";
import {
  achievement,
  badgeDefinition,
  boosterItem,
  challenge,
  challengeParticipation,
  checkIn,
  occasion,
  presenceBonus,
  reward,
} from "../schema";
import type {
  AttendanceExtent,
  AttendanceList,
  CheckInSource,
  CheckInStatus,
} from "./check-in-pure";
import { getPresenceStreak } from "./presence-streak";

/** Reconocimientos propios: no incluye clasificaciones ni nombres de otras personas. */
export async function listPresenceHistoryFor(personId: string) {
  const terms = await listAllTerms();
  const bonuses = await getDb()
    .select()
    .from(presenceBonus)
    .where(eq(presenceBonus.personId, personId))
    .orderBy(asc(presenceBonus.weekKey), asc(presenceBonus.version));
  const seasons = await Promise.all(
    terms.map(async (term) => ({
      termId: term.id,
      ...(await getPresenceStreak(personId, term.id)),
    })),
  );
  return { seasons, bonuses };
}

// Lecturas planas para los exportes CSV (ADR-035 regla 17): con nombre y correo, solo para ADMIN.

export interface CheckInExportRow {
  id: string;
  personName: string;
  email: string;
  occasionTitle: string;
  occasionId: string;
  at: Date;
  source: CheckInSource;
  status: CheckInStatus;
  attendanceExtent: AttendanceExtent | null;
  attendanceList: AttendanceList | null;
  reason: string | null;
}

export async function listCheckInsForExport(params: {
  q: string;
  occasionId?: string | undefined;
  termId?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: CheckInExportRow[]; total: number }> {
  const conditions = [];
  if (params.occasionId) {
    conditions.push(eq(checkIn.occasionId, params.occasionId));
  }
  if (params.termId) {
    conditions.push(
      inArray(
        checkIn.occasionId,
        getDb()
          .select({ id: occasion.id })
          .from(occasion)
          .where(eq(occasion.termId, params.termId)),
      ),
    );
  }
  const db = getDb();
  if (params.q) {
    // El nombre vive en `people`: la búsqueda se resuelve primero a las personas con asistencia en ese
    // alcance y después se pagina sobre ellas, para que el tope no la deje a medias (ADR-118 regla 13).
    const scope = conditions.length > 0 ? and(...conditions) : undefined;
    const candidates = await db
      .selectDistinct({ personId: checkIn.personId })
      .from(checkIn)
      .where(scope);
    const names = await getPeopleByIds(candidates.map((item) => item.personId));
    const needle = params.q.toLowerCase();
    const matching = candidates
      .map((item) => item.personId)
      .filter((id) => (names.get(id)?.fullName?.trim() ?? "").toLowerCase().includes(needle));
    if (matching.length === 0) {
      return { rows: [], total: 0 };
    }
    conditions.push(inArray(checkIn.personId, matching));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: checkIn, occasionTitle: occasion.title })
      .from(checkIn)
      .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
      .where(where)
      .orderBy(desc(checkIn.at))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(checkIn).where(where),
  ]);
  const people = await getPeopleByIds(rows.map((item) => item.row.personId));
  const mapped = rows.map((item) => ({
    id: item.row.id,
    personName: people.get(item.row.personId)?.fullName?.trim() ?? "",
    email: people.get(item.row.personId)?.email ?? "",
    occasionTitle: item.occasionTitle,
    occasionId: item.row.occasionId,
    at: item.row.at,
    source: item.row.source,
    status: item.row.status,
    attendanceExtent: item.row.attendanceExtent,
    attendanceList: item.row.attendanceList,
    reason: item.row.reason,
  }));
  return { rows: mapped, total: total?.n ?? 0 };
}

// Export de participaciones en retos (ADR-067 regla 16): cabeceras T-2570, con datos personales.

export interface ChallengeParticipationExportRow {
  id: string;
  challengeTitle: string;
  kind: ChallengeKind;
  termCode: string;
  personName: string;
  email: string;
  status: ParticipationStatus;
  submittedAt: Date;
  base: number | null;
  extra: number | null;
  boosterKind: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  reason: string | null;
}

export async function listParticipationsForExport(params: {
  termId?: string | undefined;
  challengeId?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: ChallengeParticipationExportRow[]; total: number }> {
  const conditions = [];
  if (params.termId) {
    conditions.push(eq(challenge.termId, params.termId));
  }
  if (params.challengeId) {
    conditions.push(eq(challengeParticipation.challengeId, params.challengeId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, terms, [total]] = await Promise.all([
    db
      .select({
        participation: challengeParticipation,
        challenge,
        reward,
        boosterKind: boosterItem.kind,
      })
      .from(challengeParticipation)
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .leftJoin(reward, eq(reward.id, challengeParticipation.rewardId))
      .leftJoin(boosterItem, eq(boosterItem.id, reward.boosterItemId))
      .where(where)
      .orderBy(desc(challengeParticipation.submittedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    listAllTerms(),
    db
      .select({ n: count() })
      .from(challengeParticipation)
      .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
      .where(where),
  ]);
  const termCode = new Map(terms.map((term) => [term.id, term.code]));
  const peopleIds = [
    ...rows.map((item) => item.participation.personId),
    ...rows.map((item) => item.participation.decidedById).filter((id): id is string => id !== null),
  ];
  const people = await getPeopleByIds(peopleIds);
  const mapped = rows.map((item) => ({
    id: item.participation.id,
    challengeTitle: item.challenge.title,
    kind: item.challenge.kind,
    termCode: termCode.get(item.challenge.termId) ?? "",
    personName: people.get(item.participation.personId)?.fullName?.trim() ?? "",
    email: people.get(item.participation.personId)?.email ?? "",
    status: item.participation.status,
    submittedAt: item.participation.submittedAt,
    base: item.reward?.baseGranted ?? null,
    extra: item.reward?.extraPoints ?? null,
    boosterKind: item.boosterKind ?? null,
    decidedAt: item.participation.decidedAt,
    decidedByName: item.participation.decidedById
      ? (people.get(item.participation.decidedById)?.fullName?.trim() ?? "")
      : null,
    reason: item.participation.reason,
  }));
  return { rows: mapped, total: total?.n ?? 0 };
}

// Export de insignias (ADR-067 regla 16): cabeceras T-2571, una fila por logro con su persona.

export interface AchievementExportRow {
  id: string;
  personName: string;
  email: string;
  badgeCode: string;
  badgeName: string;
  level: number;
  unlockedAt: Date;
  historical: boolean;
  revokedAt: Date | null;
}

export async function listAchievementsForExport(params: {
  termId?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: AchievementExportRow[]; total: number }> {
  const where = params.termId ? eq(achievement.termId, params.termId) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ achievement, badge: badgeDefinition })
      .from(achievement)
      .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
      .where(where)
      .orderBy(desc(achievement.unlockedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(achievement).where(where),
  ]);
  const people = await getPeopleByIds(rows.map((item) => item.achievement.personId));
  const mapped = rows.map((item) => ({
    id: item.achievement.id,
    personName: people.get(item.achievement.personId)?.fullName?.trim() ?? "",
    email: people.get(item.achievement.personId)?.email ?? "",
    badgeCode: item.badge.code,
    badgeName: item.badge.name,
    level: item.badge.level,
    unlockedAt: item.achievement.unlockedAt,
    historical: item.achievement.historical,
    revokedAt: item.achievement.revokedAt,
  }));
  return { rows: mapped, total: total?.n ?? 0 };
}
