import { APP_TIME_ZONE, addDays, atHourIn } from "@/shared/lib/dates-pure";
import type {
  GamerCredit,
  GamerMilestone,
  GamerParticipation,
  GamerStanding,
} from "../gamer-types";
import { weekKeyFor } from "./gamification-pure";

function monday(day: string): string {
  return weekKeyFor(atHourIn(APP_TIME_ZONE, day, 12));
}

/** Un premio positivo habilita una participación; los avances posteriores no vuelven a contar. */
export function uniqueGamerParticipations(
  rows: readonly GamerParticipation[],
): GamerParticipation[] {
  const unique = new Map<string, GamerParticipation>();
  for (const row of rows) unique.set(`${row.personId}:${row.day}:${row.game}`, row);
  return [...unique.values()];
}

/** Suma los créditos vivos; participaciones y días solo desempatan. El nombre no da mérito. */
export function rankGamer(
  members: readonly { personId: string; name: string; anonymized: boolean }[],
  credits: readonly GamerCredit[],
): GamerStanding[] {
  const counts = new Map<string, { points: number; games: Set<string>; days: Set<string> }>();
  for (const row of credits) {
    if (row.points <= 0) continue;
    const count = counts.get(row.personId) ?? {
      points: 0,
      games: new Set<string>(),
      days: new Set<string>(),
    };
    count.points += row.points;
    count.games.add(`${row.day}:${row.game}`);
    count.days.add(row.day);
    counts.set(row.personId, count);
  }
  const rows = members
    .flatMap((member) => {
      const count = counts.get(member.personId);
      return count
        ? [
            {
              ...member,
              points: count.points,
              participations: count.games.size,
              activeDays: count.days.size,
              rank: 0,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.participations - a.participations ||
        b.activeDays - a.activeDays ||
        a.name.localeCompare(b.name, "es") ||
        a.personId.localeCompare(b.personId),
    );
  let previous: GamerStanding | undefined;
  return rows.map((row, index) => {
    row.rank =
      previous &&
      previous.points === row.points &&
      previous.participations === row.participations &&
      previous.activeDays === row.activeDays
        ? previous.rank
        : index + 1;
    previous = row;
    return row;
  });
}

/**
 * El comodín cubre automáticamente un día cerrado por semana, después de iniciar una racha.
 * Conserva el contador, sin incrementarlo. Hoy sigue pendiente hasta la medianoche de Colombia.
 * La ventana del semestre impide arrastrar rachas o comodines de la temporada anterior.
 */
export function gamerStreak(
  days: readonly string[],
  startsOn: string,
  endsOn: string,
  today: string,
): {
  currentStreak: number;
  longestStreak: number;
  weekWildcardUsed: boolean;
  milestones: GamerMilestone[];
  nextMilestone: number | null;
} {
  const active = new Set(days.filter((day) => day >= startsOn && day <= endsOn && day <= today));
  const milestones: GamerMilestone[] = [3, 7, 30].map((days) => ({
    days: days as 3 | 7 | 30,
    reachedOn: null,
  }));
  let currentStreak = 0;
  let longestStreak = 0;
  let wildcardWeek: string | null = null;
  const first = [...active].sort()[0];
  if (first) {
    for (let key = first; key <= (endsOn < today ? endsOn : today); key = addDays(key, 1)) {
      if (active.has(key)) {
        currentStreak += 1;
        longestStreak = Math.max(longestStreak, currentStreak);
        for (const milestone of milestones) {
          if (currentStreak >= milestone.days && !milestone.reachedOn) milestone.reachedOn = key;
        }
      } else if (key < today) {
        if (currentStreak > 0 && wildcardWeek !== monday(key)) wildcardWeek = monday(key);
        else currentStreak = 0;
      }
    }
  }
  return {
    currentStreak,
    longestStreak,
    weekWildcardUsed: today >= startsOn && today <= endsOn && wildcardWeek === monday(today),
    milestones,
    nextMilestone: milestones.find((item) => !item.reachedOn)?.days ?? null,
  };
}
