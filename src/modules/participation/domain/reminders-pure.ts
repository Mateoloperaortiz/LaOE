import { dateKeyIn, hourIn } from "@/shared/lib/dates";
import type { OccasionCategory, OccasionKind, OccasionStatus } from "./occasion-pure";

// Recordatorios de participación sin I/O (ADR-038 regla 9): qué ocasiones abiertas merecen aviso en
// este tick horario, en la hora de Bogotá. `today` y `eve` salen de `reminders.hours`.

export type ReminderSlot = "TODAY" | "MEETING_EVE" | "ASSEMBLY_EVE" | "ASSEMBLY_SOON";

export interface ReminderHours {
  today: number;
  eve: number;
}

export interface ReminderOccasion {
  id: string;
  kind: OccasionKind;
  category: OccasionCategory;
  status: OccasionStatus;
  startsAt: Date;
}

export interface DueReminder {
  slot: ReminderSlot;
  occasionId: string;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A la hora `today`, las actividades de hoy que aún no empezaron (las reuniones de comité no: tienen
 * su aviso la víspera); a la hora `eve`, las reuniones de comité y las asambleas de mañana; a cualquier
 * hora, las asambleas que empiezan entre 2 y 3 horas después.
 */
export function reminderSlots(
  occasions: readonly ReminderOccasion[],
  now: Date,
  hours: ReminderHours,
  timeZone: string,
): DueReminder[] {
  const hour = hourIn(timeZone, now);
  const today = dateKeyIn(timeZone, now);
  const tomorrow = dateKeyIn(timeZone, new Date(now.getTime() + DAY_MS));
  const due: DueReminder[] = [];
  for (const occasion of occasions) {
    if (occasion.status !== "OPEN") {
      continue;
    }
    const day = dateKeyIn(timeZone, occasion.startsAt);
    const untilStart = occasion.startsAt.getTime() - now.getTime();
    const meeting = occasion.kind === "ACTIVITY" && occasion.category === "COMMITTEE_MEETING";
    if (occasion.kind === "ASSEMBLY") {
      if (hour === hours.eve && day === tomorrow) {
        due.push({ slot: "ASSEMBLY_EVE", occasionId: occasion.id });
      }
      if (untilStart >= 2 * HOUR_MS && untilStart < 3 * HOUR_MS) {
        due.push({ slot: "ASSEMBLY_SOON", occasionId: occasion.id });
      }
      continue;
    }
    if (meeting) {
      if (hour === hours.eve && day === tomorrow) {
        due.push({ slot: "MEETING_EVE", occasionId: occasion.id });
      }
      continue;
    }
    if (hour === hours.today && day === today && untilStart > 0) {
      due.push({ slot: "TODAY", occasionId: occasion.id });
    }
  }
  return due;
}
