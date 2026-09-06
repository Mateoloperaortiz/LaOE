import { t } from "@/shared/copy";
import type { Notice } from "./permanence-pure";

// Avisos de permanencia por push (ADR-038 regla 10): cada aviso de `noticesFor` se traduce a su texto
// del inventario (T-184 a T-188), su URL y una clave por término, persona y aviso (por comité cuando
// aplica; por semana ISO en las evaluaciones). La asamblea obligatoria la recuerda participation.

export interface NoticePush {
  text: string;
  url: string;
  dedupeKey: string;
}

/** "AAAA-Www" de la semana ISO de una fecha (UTC). */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function noticePush(
  notice: Notice,
  context: { termId: string; personId: string; committeeName: string; now: Date },
): NoticePush | null {
  const base = `notice:${context.termId}:${context.personId}`;
  const values = { ...notice.values, comité: context.committeeName };
  switch (notice.kind) {
    case "MID_TERM":
      return {
        text: t("T-184", values),
        url: "/app/permanencia",
        dedupeKey: `${base}:MID_TERM:${notice.committeeId ?? ""}`,
      };
    case "CLOSING_WARNING":
      return {
        text: t("T-185", values),
        url: "/app/permanencia",
        dedupeKey: `${base}:CLOSING_WARNING:${notice.committeeId ?? ""}`,
      };
    case "NO_ALCANZA":
      return {
        text: t("T-186", values),
        url: "/app/permanencia",
        dedupeKey: `${base}:NO_ALCANZA:${notice.committeeId ?? ""}`,
      };
    case "TERM_CLOSED":
      return {
        text: t("T-187", values),
        url: "/app/permanencia",
        dedupeKey: `${base}:TERM_CLOSED`,
      };
    case "EVALUATION_WINDOW_OPENED":
    case "EVALUATIONS_PENDING":
      // `values.fecha` llega ya formateada por quien llama (la función pura no conoce la zona horaria).
      return {
        text: t("T-188", values),
        url: "/admin/permanencia/evaluaciones",
        dedupeKey: `${base}:EVALUATIONS:${isoWeek(context.now)}`,
      };
    default:
      return null;
  }
}
