// Programados (ADR-012): el scheduler encola eventos del outbox; los handlers hacen el trabajo.
// Horas en America/Bogota. campaigns y reminders llegan con la fase 6.

export interface ScheduleEntry {
  name: string;
  cron: string;
  events: string[];
}

export const SCHEDULE: ScheduleEntry[] = [
  { name: "prune", cron: "0 3 * * *", events: ["identity.prune", "system.prune"] },
  { name: "backup-check", cron: "30 3 * * *", events: ["system.backup-check"] },
];
