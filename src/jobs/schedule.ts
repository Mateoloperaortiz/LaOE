// Programados (ADR-012): el scheduler encola eventos del outbox; los handlers hacen el trabajo.
// Horas en America/Bogota. `reminders` cierra ocasiones vencidas y avisa si falta el término
// siguiente (fase 3); los recordatorios a personas y `campaigns` llegan con la fase 6.

export interface ScheduleEntry {
  name: string;
  cron: string;
  events: string[];
}

export const SCHEDULE: ScheduleEntry[] = [
  {
    name: "reminders",
    cron: "0 * * * *",
    events: ["participation.auto-close", "participation.term-check"],
  },
  { name: "prune", cron: "0 3 * * *", events: ["identity.prune", "system.prune"] },
  { name: "backup-check", cron: "30 3 * * *", events: ["system.backup-check"] },
];
