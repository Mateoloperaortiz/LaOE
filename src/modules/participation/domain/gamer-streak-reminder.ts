import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { NOTIFICATION_MAX_RECIPIENTS, notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { getEnv } from "@/env";
import { listActiveMemberRefs } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import { splitTitleBody } from "@/shared/copy/render";
import { startOfNextDayIn } from "@/shared/lib/dates-pure";
import { loadGamerParticipations } from "./gamer";
import { gamerStreak } from "./gamer-pure";
import { getGamificationLaunch } from "./gamification-launch";
import { dayKeyFor } from "./gamification-pure";

export interface GamerStreakReminderResult {
  day: string;
  audience: number;
  enqueued: number;
}

/**
 * Aviso opcional de las 20:00 (ADR-131). Lee todos los hechos del semestre una vez: no consulta
 * una temporada por persona. El bus respeta el opt-in al entregar y descarta el aviso a medianoche.
 */
export async function runGamerStreakReminder(now = new Date()): Promise<GamerStreakReminderResult> {
  const day = dayKeyFor(now);
  const empty = { day, audience: 0, enqueued: 0 };
  if (!(await requireConfig("gamification.enabled"))) return empty;
  const { launchedAt } = await getGamificationLaunch();
  if (!launchedAt || !(Date.parse(launchedAt) <= now.getTime())) return empty;
  const db = getDb();
  const term = await findTermContaining(day, db);
  if (!term || term.pointsClosedAt) return empty;

  const [members, participations] = await Promise.all([
    listActiveMemberRefs(true),
    loadGamerParticipations(term.id, db),
  ]);
  const daysByPerson = new Map<string, Set<string>>();
  for (const participation of participations) {
    const days = daysByPerson.get(participation.personId) ?? new Set<string>();
    days.add(participation.day);
    daysByPerson.set(participation.personId, days);
  }
  const groups = { available: [] as string[], used: [] as string[] };
  for (const member of members) {
    if (member.anonymized) continue;
    const days = daysByPerson.get(member.personId);
    if (!days || days.has(day)) continue;
    const streak = gamerStreak([...days], term.startsOn, term.endsOn, day);
    if (streak.currentStreak === 0) continue;
    groups[streak.weekWildcardUsed ? "used" : "available"].push(member.personId);
  }

  const expiresAt = startOfNextDayIn(getEnv().APP_TIMEZONE, now).toISOString();
  let enqueued = 0;
  for (const variant of ["available", "used"] as const) {
    const recipients = groups[variant];
    const { title, body } = splitTitleBody(t(variant === "available" ? "T-3453" : "T-3454"));
    for (let start = 0; start < recipients.length; start += NOTIFICATION_MAX_RECIPIENTS) {
      await enqueueEvent(
        db,
        eventOf(
          notificationRequested,
          {
            kind: "GAMER_STREAK",
            recipients: recipients
              .slice(start, start + NOTIFICATION_MAX_RECIPIENTS)
              .map((personId) => ({ personId })),
            title,
            body,
            url: "/app/juegos",
            tag: "gamer-streak",
            dedupeKey: `gamer-streak:${day}`,
            expiresAt,
          },
          {
            dedupeKey: `gamer-streak-reminder:${day}:${variant}:${start / NOTIFICATION_MAX_RECIPIENTS}`,
          },
        ),
      );
      enqueued += 1;
    }
  }
  return { day, audience: groups.available.length + groups.used.length, enqueued };
}
