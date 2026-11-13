import { t } from "@/shared/copy";

type Reservation = {
  status: "CONFIRMED" | "OUT" | "RETURNED" | "CANCELLED";
  overdue: boolean;
};

const LABELS = {
  CONFIRMED: "T-4327",
  OUT: "T-4328",
  RETURNED: "T-4329",
  CANCELLED: "T-4330",
} as const;

/** El estado de una reserva en palabras; un préstamo vencido lo dice antes que nada (ADR-150 regla 4). */
export function statusLabel(row: Reservation): string {
  return t(row.status === "OUT" && row.overdue ? "T-4331" : LABELS[row.status]);
}

export function reservationTone(row: Reservation): "error" | "info" | "exito" | "neutral" {
  if (row.status === "OUT") return row.overdue ? "error" : "info";
  if (row.status === "CONFIRMED") return "exito";
  return "neutral";
}
