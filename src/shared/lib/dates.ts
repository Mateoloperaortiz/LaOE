import { getEnv } from "@/env";

// Presentación en America/Bogota; la base y el proceso viven en UTC (ADR-020).

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: getEnv().APP_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
