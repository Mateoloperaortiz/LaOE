import { addDays, dateKeyIn } from "@/shared/lib/dates-pure";

// La línea de tiempo del inventario (ADR-191 regla 4): una fila por material y una columna por día,
// con cada reserva como una barra. Las reservas que se cruzan en el mismo material bajan a otro
// carril, para que ninguna tape a otra. Solo cuentan las vivas: confirmadas y en préstamo.

export const TIMELINE_DAYS = 14;

export interface TimelineReservation {
  id: string;
  status: "CONFIRMED" | "OUT" | "RETURNED" | "CANCELLED";
  overdue: boolean;
  startsAt: Date;
  endsAt: Date;
  scopeLabel: string;
  requesterName: string;
  lines: Array<{ itemId: string; itemName: string; quantity: number }>;
}

export interface TimelineBar {
  reservationId: string;
  scopeLabel: string;
  requesterName: string;
  quantity: number;
  startsAt: Date;
  endsAt: Date;
  /** Columna donde empieza, contando desde 0. */
  start: number;
  /** Cuántas columnas ocupa, al menos una. */
  span: number;
  lane: number;
  tone: "exito" | "info" | "error";
}

export interface TimelineRow {
  itemId: string;
  itemName: string;
  lanes: number;
  bars: TimelineBar[];
}

/** Los días de la ventana, desde `first`, como claves AAAA-MM-DD. */
export function timelineDays(first: string, count = TIMELINE_DAYS): string[] {
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

/** El último instante de la reserva cae en el día anterior a su fin cuando termina a medianoche. */
function lastDay(endsAt: Date, timeZone: string): string {
  return dateKeyIn(timeZone, new Date(endsAt.getTime() - 1));
}

export function buildTimeline(
  items: Array<{ id: string; name: string }>,
  reservations: TimelineReservation[],
  days: string[],
  timeZone: string,
  now = new Date(),
): TimelineRow[] {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return [];
  const live = reservations.filter((row) => row.status === "CONFIRMED" || row.status === "OUT");
  return items.map((item) => {
    const bars: Omit<TimelineBar, "lane">[] = [];
    for (const reservation of live) {
      const quantity = reservation.lines
        .filter((line) => line.itemId === item.id)
        .reduce((sum, line) => sum + line.quantity, 0);
      if (quantity === 0) continue;
      const startDay = dateKeyIn(timeZone, reservation.startsAt);
      // Un préstamo vencido sigue ocupando el material hasta hoy (ADR-150 regla 4).
      const endsAt =
        reservation.status === "OUT" && reservation.endsAt < now ? now : reservation.endsAt;
      const endDay = lastDay(endsAt, timeZone);
      if (endDay < first || startDay > last) continue;
      const start = startDay < first ? 0 : days.indexOf(startDay);
      const end = endDay > last ? days.length - 1 : days.indexOf(endDay);
      bars.push({
        reservationId: reservation.id,
        scopeLabel: reservation.scopeLabel,
        requesterName: reservation.requesterName,
        quantity,
        startsAt: reservation.startsAt,
        endsAt: reservation.endsAt,
        start,
        span: Math.max(1, end - start + 1),
        tone: reservation.status === "OUT" ? (reservation.overdue ? "error" : "info") : "exito",
      });
    }
    bars.sort((a, b) => a.start - b.start || b.span - a.span);
    const laneEnds: number[] = [];
    const placed = bars.map((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = bar.start + bar.span - 1;
      return { ...bar, lane };
    });
    return {
      itemId: item.id,
      itemName: item.name,
      lanes: Math.max(1, laneEnds.length),
      bars: placed,
    };
  });
}
