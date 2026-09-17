// Programados (ADR-012, ADR-038): el scheduler encola eventos del outbox; los handlers hacen el
// trabajo. Horas en America/Bogota. `reminders` cierra ocasiones vencidas y avisa si falta el término
// siguiente (fase 3); `campaigns` arranca las campañas vencidas y manda un lote por minuto (fase 6).

export interface ScheduleEntry {
  name: string;
  cron: string;
  events: string[];
}

export const SCHEDULE: ScheduleEntry[] = [
  { name: "wallet", cron: "5 0 * * *", events: ["wallet.reconcile"] },
  { name: "campaigns", cron: "* * * * *", events: ["comms.campaign-tick"] },
  {
    name: "reminders",
    cron: "0 * * * *",
    events: ["participation.auto-close", "participation.term-check", "participation.reminders"],
  },
  // Aviso diario del Wordle (ADR-074): cuatro horas después de que empiece el día del juego.
  { name: "wordle", cron: "0 9 * * *", events: ["participation.wordle-reminder"] },
  // Permanencia (ADR-036 regla 5): recalcula el término actual cada día para que "lo posible" envejezca.
  { name: "permanence", cron: "0 6 * * *", events: ["permanence.daily"] },
  // Avisos de permanencia por push (ADR-038 regla 10), a una hora en la que alguien los lee.
  { name: "notices", cron: "0 9 * * *", events: ["permanence.notices"] },
  // Licencias vencidas sin regreso (Est. art. 11.3; ADR-060 regla 10): abre una tarea a GH.
  { name: "membership", cron: "0 7 * * *", events: ["membership.leave-check"] },
  { name: "prune", cron: "0 3 * * *", events: ["identity.prune", "system.prune"] },
  { name: "backup-check", cron: "30 3 * * *", events: ["system.backup-check"] },
];
