import { APP_TIME_ZONE, addDays, zonedInputToUtc } from "@/shared/lib/dates-pure";

/** El día y el préstamo comparten el convenio [inicio, fin) de las reservas. */
export function reservationOnCalendarDay(
  reservation: { startsAt: Date; endsAt: Date },
  day: string,
): boolean {
  const start = zonedInputToUtc(`${day}T00:00`, APP_TIME_ZONE);
  const end = zonedInputToUtc(`${addDays(day, 1)}T00:00`, APP_TIME_ZONE);
  return reservation.startsAt < end && reservation.endsAt > start;
}
