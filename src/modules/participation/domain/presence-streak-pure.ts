import { APP_TIME_ZONE, addDays, atHourIn } from "@/shared/lib/dates-pure";
import type { PresenceStreak, PresenceWeek } from "../presence-types";
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
 * participa y la semana corriente no se pierde antes de terminar. La agenda punitiva es la que ya
 * estaba publicada al empezar la semana (o al ingresar); un evento tardío solo puede mejorarla.
 */
export function presenceStreakFromFacts(input: {
  term: { id: string; startsOn: string; endsOn: string };
  member: PresenceMemberHistory | null;
  occasions: readonly PresenceOccasionFact[];
  launchedAt: Date | null;
  now: Date;
}): PresenceStreak {
  const { term, member, occasions, launchedAt, now } = input;
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
        row.checkInStatus === "APPROVED" &&
        row.startsAt <= now &&
        (!member || statusAt(member, row.startsAt) !== "ON_LEAVE"),
    );
    const opportunities = member
      ? facts.filter((row) => {
          const status = statusAt(member, row.startsAt);
          return (
            (status === "ACTIVE" || status === "HONORARY") &&
            row.startsAt >= joinedAt &&
            row.checkInStatus !== "EXCUSED" &&
            row.openedAt !== null &&
            row.openedAt <= cutoff &&
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
    weeks.push({ weekKey: key, status, streak: currentStreak, bonus });
  }
  const current = weeks.find((row) => row.weekKey === weekKey) ?? weeks.at(-1);
  return {
    launched: launchedAt !== null && launchedAt <= now,
    currentStreak,
    longestStreak,
    weekKey,
    weekStatus: current?.status ?? "PAUSED",
    bonus: current?.bonus ?? 0,
    nextBonus: presenceBonusFor(currentStreak + 1),
    weeks,
  };
}
