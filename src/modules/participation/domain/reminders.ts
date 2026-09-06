import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { getEnv } from "@/env";
import { listActiveMemberRefs, listCommitteesByIds, listTermRoster } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { splitTitleBody } from "@/shared/copy/render";
import { formatDate, formatTime } from "@/shared/lib/dates";
import { listOccasionsForTerm, type OccasionRow } from "./occasions";
import { type DueReminder, reminderSlots } from "./reminders-pure";

// Recordatorios de participación (ADR-038 regla 9): cada hora, las ocasiones que tocan aviso salen al
// bus de notificaciones con su audiencia (el comité, los nuevos o todos los activos y honorarios).
// comms entrega por push y descarta a quien ya recibió esa clave; la clave del outbox evita repetir
// un envío pendiente dentro de la misma hora.

const MAX_RECIPIENTS = 1000;

interface Audience {
  all: string[];
  newMembers: string[];
  byCommittee: Map<string, string[]>;
}

async function loadAudience(termId: string): Promise<Audience> {
  const [members, roster] = await Promise.all([listActiveMemberRefs(true), listTermRoster(termId)]);
  const eligible = new Set(members.filter((item) => !item.anonymized).map((item) => item.personId));
  const byCommittee = new Map<string, string[]>();
  for (const row of roster) {
    if (row.leftAt !== null || !eligible.has(row.personId)) {
      continue;
    }
    const list = byCommittee.get(row.committeeId) ?? [];
    if (!list.includes(row.personId)) {
      list.push(row.personId);
    }
    byCommittee.set(row.committeeId, list);
  }
  return {
    all: [...eligible],
    newMembers: members
      .filter((item) => !item.anonymized && item.firstTermId === termId)
      .map((item) => item.personId),
    byCommittee,
  };
}

function audienceFor(occasion: OccasionRow, audience: Audience): string[] {
  if (occasion.committeeId) {
    return audience.byCommittee.get(occasion.committeeId) ?? [];
  }
  return occasion.newMembersOnly ? audience.newMembers : audience.all;
}

function textFor(due: DueReminder, occasion: OccasionRow, committeeName: string): string {
  const hora = formatTime(occasion.startsAt);
  const lugar = occasion.location;
  switch (due.slot) {
    case "TODAY":
      return t("T-182", {
        actividad: occasion.title,
        hora,
        lugar,
        apertura: formatTime(occasion.checkInOpensAt),
      });
    case "MEETING_EVE":
      return t("T-193", { comité: committeeName || occasion.title, hora, lugar });
    default:
      return t("T-183", { día: formatDate(occasion.startsAt), hora, lugar });
  }
}

export interface RemindersResult {
  due: number;
  enqueued: number;
}

/** Un tick horario del programado `reminders`; `now` es la hora del tick (el scheduler la manda en `at`). */
export async function runReminders(now = new Date()): Promise<RemindersResult> {
  const term = await getCurrentTerm(now);
  if (!term) {
    return { due: 0, enqueued: 0 };
  }
  const hours = await requireConfig("reminders.hours");
  const occasions = await listOccasionsForTerm(term.id, ["OPEN"]);
  const due = reminderSlots(occasions, now, hours, getEnv().APP_TIMEZONE);
  if (due.length === 0) {
    return { due: 0, enqueued: 0 };
  }
  const byId = new Map(occasions.map((row) => [row.id, row]));
  const audience = await loadAudience(term.id);
  const committeeIds = [
    ...new Set(occasions.map((row) => row.committeeId).filter((id): id is string => id !== null)),
  ];
  const committeeNames = new Map(
    (await listCommitteesByIds(committeeIds)).map((item) => [item.id, item.name]),
  );
  let enqueued = 0;
  for (const item of due) {
    const occasion = byId.get(item.occasionId);
    if (!occasion) {
      continue;
    }
    const recipients = audienceFor(occasion, audience);
    const { title, body } = splitTitleBody(
      textFor(
        item,
        occasion,
        occasion.committeeId ? (committeeNames.get(occasion.committeeId) ?? "") : "",
      ),
    );
    const dedupeKey = `reminder:${item.slot}:${occasion.id}`;
    for (let start = 0; start < recipients.length; start += MAX_RECIPIENTS) {
      const chunk = recipients.slice(start, start + MAX_RECIPIENTS);
      await enqueueEvent(getDb(), {
        type: "notification.requested",
        payload: {
          kind: "REMINDER",
          recipients: chunk.map((personId) => ({ personId })),
          title,
          body,
          url: `/a/${occasion.publicId}`,
          tag: `occasion-${occasion.id}`,
          dedupeKey,
        },
        dedupeKey: `${dedupeKey}:${start / MAX_RECIPIENTS}`,
      });
      enqueued += 1;
    }
  }
  return { due: due.length, enqueued };
}
