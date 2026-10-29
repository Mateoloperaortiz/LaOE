/** Los finales se procesan antes de los inicios: los intervalos son [inicio, fin). */
export function peakReserved(
  intervals: readonly { startsAt: Date; endsAt: Date; quantity: number }[],
  startsAt: Date,
  endsAt: Date,
): number {
  const events: { at: number; delta: number }[] = [];
  for (const row of intervals) {
    const start = Math.max(row.startsAt.getTime(), startsAt.getTime());
    const end = Math.min(row.endsAt.getTime(), endsAt.getTime());
    if (start < end && row.quantity > 0)
      events.push({ at: start, delta: row.quantity }, { at: end, delta: -row.quantity });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let used = 0;
  let peak = 0;
  for (const event of events) {
    used += event.delta;
    peak = Math.max(peak, used);
  }
  return peak;
}

export function outstanding(quantity: number, returned: number, lost: number): number {
  return quantity - returned - lost;
}

type ReservationAvailability = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "CONFIRMED" | "OUT" | "RETURNED" | "CANCELLED";
};
type LineAvailability = {
  id: string;
  reservationId: string;
  itemId: string;
  quantity: number;
  returned: number;
  lost: number;
};
type UnitAssignmentAvailability = {
  lineId: string;
  unitId: string;
  returnedAt: Date | null;
  lostAt: Date | null;
};
type ItemAvailability = {
  id: string;
  mode: "UNIT" | "QUANTITY";
  total: number;
  quarantined: number;
};
type UnitAvailability = { id: string; state: "AVAILABLE" | "QUARANTINED" | "LOST" };

/** Proyección de las reservas afectadas: informa el conflicto sin modificar lo confirmado. */
export function conflictedReservationIds(
  reservations: readonly ReservationAvailability[],
  lines: readonly LineAvailability[],
  assignments: readonly UnitAssignmentAvailability[],
  items: readonly ItemAvailability[],
  units: readonly UnitAvailability[],
  now: Date,
): Set<string> {
  const byReservation = new Map(reservations.map((row) => [row.id, row]));
  const byItem = new Map(items.map((row) => [row.id, row]));
  const byUnit = new Map(units.map((row) => [row.id, row]));
  const activeLines = lines.flatMap((line) => {
    const reservation = byReservation.get(line.reservationId);
    if (!reservation || (reservation.status !== "CONFIRMED" && reservation.status !== "OUT"))
      return [];
    return [
      {
        ...line,
        status: reservation.status,
        startsAt: reservation.startsAt,
        endsAt:
          reservation.status === "OUT" && reservation.endsAt <= now
            ? new Date(8640000000000000)
            : reservation.endsAt,
        quantity:
          reservation.status === "OUT"
            ? outstanding(line.quantity, line.returned, line.lost)
            : line.quantity,
      },
    ];
  });
  const liveAssignments = assignments.filter((row) => !row.returnedAt && !row.lostAt);
  const conflicts = new Set<string>();
  for (const reservation of reservations) {
    if (reservation.status !== "CONFIRMED" || reservation.endsAt <= now) continue;
    for (const line of lines.filter((row) => row.reservationId === reservation.id)) {
      const item = byItem.get(line.itemId);
      const allocations = activeLines.filter((row) => row.itemId === line.itemId);
      if (
        !item ||
        peakReserved(allocations, reservation.startsAt, reservation.endsAt) >
          item.total - item.quarantined
      ) {
        conflicts.add(reservation.id);
        break;
      }
      if (item.mode !== "UNIT") continue;
      const allocatedUnits = liveAssignments.filter((row) => row.lineId === line.id);
      const occupiedLines = new Set(
        allocations
          .filter(
            (row) =>
              row.status === "OUT" &&
              row.quantity > 0 &&
              row.startsAt < reservation.endsAt &&
              row.endsAt > reservation.startsAt,
          )
          .map((row) => row.id),
      );
      const occupiedUnits = new Set(
        liveAssignments.filter((row) => occupiedLines.has(row.lineId)).map((row) => row.unitId),
      );
      if (
        allocatedUnits.length !== line.quantity ||
        allocatedUnits.some(
          (row) => byUnit.get(row.unitId)?.state !== "AVAILABLE" || occupiedUnits.has(row.unitId),
        )
      ) {
        conflicts.add(reservation.id);
        break;
      }
    }
  }
  return conflicts;
}
