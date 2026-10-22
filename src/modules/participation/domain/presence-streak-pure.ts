import { APP_TIME_ZONE, addDays, atHourIn } from "@/shared/lib/dates-pure";
import type { PresencePauseReason, PresenceStreak, PresenceWeek } from "../presence-types";
import { type AttendanceExtent, isCompleteAttendance } from "./check-in-pure";
import { dayKeyFor, weekKeyFor } from "./gamification-pure";

type MembershipStatus = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";

export interface PresenceMemberHistory {
  firstTermId: string;
  joinedAt: Date;
  status: MembershipStatus;
  changes: readonly { at: Date; from: MembershipStatus | null; to: MembershipStatus }[];
  committees: readonly { committeeId: string; joinedAt: Date | null; leftAt: Date | null }[];
}

export interface PresenceOccasionFact {
  startsAt: Date;
  openedAt: Date | null;
  status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
  committeeId: string | null;
  newMembersOnly: boolean;
  checkInStatus: "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED" | "EXCUSED" | null;
  attendanceExtent?: AttendanceExtent | null;
}

/** El bono es fijo por semana; nunca multiplica asistencias ni premios de retos. */
export function presenceBonusFor(streakWeeks: number): number {
  return streakWeeks < 2 ? 0 : streakWeeks === 2 ? 2 : streakWeeks === 3 ? 3 : 5;
}

function statusAt(member: PresenceMemberHistory, at: Date): MembershipStatus {
  let status = member.changes[0]?.from ?? member.changes[0]?.to ?? member.status;
  for (const change of member.changes) {
    if (change.at > at) break;
    status = change.to;
  }
  return status;
}

function onLeaveDuring(member: PresenceMemberHistory, from: Date, to: Date): boolean {
  if (statusAt(member, from) === "ON_LEAVE") return true;
  return member.changes.some(
    (change) => change.to === "ON_LEAVE" && change.at >= from && change.at < to,
  );
}

/**
 * Reconstrucción determinista: las semanas sin oportunidades pausan, el día de aprobación no
 * participa y la semana corriente no se pierde antes de terminar. Desde la vigencia de ADR-132,
 * omitir exige publicación demostrada al menos 24 h antes del inicio; las actividades anteriores
 * conservan el corte de comienzo de semana (o ingreso). Una aprobación siempre puede cumplirla.
 */
export function presenceStreakFromFacts(input: {
  term: { id: string; startsOn: string; endsOn: string };
  member: PresenceMemberHistory | null;
  occasions: readonly PresenceOccasionFact[];
  launchedAt: Date | null;
  notice24hEffectiveAt?: Date | null;
  now: Date;
}): PresenceStreak {
  const { term, member, occasions, launchedAt, now } = input;
  const uses24hNotice = (row: PresenceOccasionFact) =>
    input.notice24hEffectiveAt !== null &&
    input.notice24hEffectiveAt !== undefined &&
    row.startsAt >= input.notice24hEffectiveAt;
  const today = dayKeyFor(now);
  const weekKey = weekKeyFor(now);
  const weeks: PresenceWeek[] = [];
  let currentStreak = 0;
  let longestStreak = 0;
  const start = atHourIn(APP_TIME_ZONE, term.startsOn, 0);
  // Pertenencias históricas sin fecha representan el ingreso del roster, no su fecha de importación.
  const joinedAt =
    member?.firstTermId === term.id && !member.committees.some((row) => row.joinedAt === null)
      ? member.joinedAt
      : start;
  const endDay = today < term.endsOn ? today : term.endsOn;
  for (let key = weekKeyFor(start); key <= endDay; key = addDays(key, 7)) {
    const from = atHourIn(APP_TIME_ZONE, key, 0);
    const to = atHourIn(APP_TIME_ZONE, addDays(key, 7), 0);
    const cutoff = new Date(Math.max(from.getTime(), start.getTime(), joinedAt.getTime()));
    const publicationDeadline = (row: PresenceOccasionFact) =>
      uses24hNotice(row) ? new Date(row.startsAt.getTime() - 24 * 60 * 60 * 1000) : cutoff;
    const facts = occasions.filter(
      (row) =>
        row.startsAt >= from &&
        row.startsAt < to &&
        row.startsAt >= start &&
        dayKeyFor(row.startsAt) <= term.endsOn &&
        row.status !== "DRAFT" &&
        row.status !== "CANCELLED",
    );
    const approved = facts.filter(
      (row) =>
        row.checkInStatus !== null &&
        isCompleteAttendance({
          status: row.checkInStatus,
          attendanceExtent: row.attendanceExtent === undefined ? "FULL" : row.attendanceExtent,
        }) &&
        row.startsAt <= now &&
        (!member || statusAt(member, row.startsAt) !== "ON_LEAVE"),
    );
    const eligible = member
      ? facts.filter((row) => {
          const status = statusAt(member, row.startsAt);
          return (
            (status === "ACTIVE" || status === "HONORARY") &&
            row.startsAt >= joinedAt &&
            (!row.newMembersOnly || member.firstTermId === term.id) &&
            (!row.committeeId ||
              member.committees.some(
                (item) =>
                  item.committeeId === row.committeeId &&
                  (!item.joinedAt || item.joinedAt <= row.startsAt) &&
                  (!item.leftAt || item.leftAt > row.startsAt),
              ))
          );
        })
      : [];
    // Tener oferta no equivale a poder perder la semana por no asistir: una publicación tardía
    // permite cumplir, pero conserva la protección. Se mantienen separados para explicar la pausa.
    const opportunities = eligible.filter(
      (row) =>
        row.checkInStatus !== "EXCUSED" &&
        row.openedAt !== null &&
        row.openedAt <= publicationDeadline(row) &&
        (!uses24hNotice(row) || row.openedAt <= now),
    );
    let status: PresenceWeek["status"];
    let bonus = 0;
    if (approved.length > 0) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
      status = "COMPLETED";
      if (launchedAt && approved.some((row) => row.startsAt >= launchedAt))
        bonus = presenceBonusFor(currentStreak);
    } else if (opportunities.length === 0 || (member && onLeaveDuring(member, from, to))) {
      status = "PAUSED";
    } else if (to > now && today <= term.endsOn) {
      status = "PENDING";
    } else {
      status = "MISSED";
      currentStreak = 0;
    }
    const pauseReasons: PresencePauseReason[] = [];
    if (status === "PAUSED") {
      if (member && onLeaveDuring(member, from, to)) pauseReasons.push("ON_LEAVE");
      if (eligible.some((row) => row.checkInStatus === "EXCUSED")) pauseReasons.push("EXCUSED");
      const unexcused = eligible.filter((row) => row.checkInStatus !== "EXCUSED");
      if (
        unexcused.some(
          (row) =>
            !uses24hNotice(row) &&
            row.openedAt !== null &&
            row.openedAt > cutoff &&
            row.openedAt <= now,
        )
      ) {
        pauseReasons.push("LATE_PUBLICATION");
      }
      if (
        unexcused.some(
          (row) =>
            uses24hNotice(row) &&
            row.openedAt !== null &&
            row.openedAt > publicationDeadline(row) &&
            row.openedAt <= now,
        )
      ) {
        pauseReasons.push("SHORT_NOTICE");
      }
      if (unexcused.some((row) => row.openedAt === null || row.openedAt > now)) {
        pauseReasons.push("INSUFFICIENT_HISTORY");
      }
      if (pauseReasons.length === 0) {
        // Sin hechos de la semana podemos afirmar que no hay actividades registradas. Si existen
        // hechos pero no se demuestra su elegibilidad/publicación, no se inventa ausencia de oferta.
        pauseReasons.push(facts.length === 0 ? "NO_RECORDED_ACTIVITIES" : "INSUFFICIENT_HISTORY");
      }
    }
    weeks.push({ weekKey: key, status, streak: currentStreak, bonus, pauseReasons });
  }
  const current = weeks.find((row) => row.weekKey === weekKey) ?? weeks.at(-1);
  return {
    recognitionAvailable: true,
    launched: launchedAt !== null && launchedAt <= now,
    currentStreak,
    longestStreak,
    weekKey,
    weekStatus: current?.status ?? "PAUSED",
    bonus: current?.bonus ?? 0,
    nextBonus: presenceBonusFor(currentStreak + 1),
    weeks,
    weekPauseReasons: current?.pauseReasons ?? [],
  };
}
