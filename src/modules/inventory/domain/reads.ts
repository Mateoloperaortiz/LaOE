import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import {
  inventoryIncident,
  inventoryItem,
  inventoryMovement,
  inventoryReservation,
  inventoryReservationLine,
  inventoryReservationUnit,
  inventoryUnit,
} from "../schema";
import { getInventoryContext } from "./access";
import { conflictedReservationIds, outstanding, peakReserved } from "./availability-pure";
import type { InventoryIncidentView, InventoryItemView, InventoryReservationView } from "./types";

export async function readCatalog(exec: Executor = getDb()): Promise<InventoryItemView[]> {
  const [items, units] = await Promise.all([
    exec.select().from(inventoryItem).orderBy(asc(inventoryItem.name)),
    exec.select().from(inventoryUnit).orderBy(asc(inventoryUnit.barcode)),
  ]);
  return items.map((item) => ({
    ...item,
    active: item.active === 1,
    units: units
      .filter((unit) => unit.itemId === item.id)
      .map(({ id, barcode, state }) => ({ id, barcode, state })),
  }));
}

export async function allocationsFor(itemId: string, exec: Executor, now = new Date()) {
  const rows = await exec
    .select({ reservation: inventoryReservation, line: inventoryReservationLine })
    .from(inventoryReservationLine)
    .innerJoin(
      inventoryReservation,
      eq(inventoryReservation.id, inventoryReservationLine.reservationId),
    )
    .where(
      and(
        eq(inventoryReservationLine.itemId, itemId),
        inArray(inventoryReservation.status, ["CONFIRMED", "OUT"]),
      ),
    );
  return rows.map(({ reservation, line }) => ({
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
  }));
}

export async function busyUnitIds(
  itemId: string,
  startsAt: Date,
  endsAt: Date,
  exec: Executor,
  now = new Date(),
): Promise<Set<string>> {
  const allocations = (await allocationsFor(itemId, exec, now)).filter(
    (row) => row.startsAt < endsAt && row.endsAt > startsAt && row.quantity > 0,
  );
  if (!allocations.length) return new Set();
  const rows = await exec
    .select({ unitId: inventoryReservationUnit.unitId })
    .from(inventoryReservationUnit)
    .where(
      and(
        inArray(
          inventoryReservationUnit.lineId,
          allocations.map((row) => row.id),
        ),
        isNull(inventoryReservationUnit.returnedAt),
        isNull(inventoryReservationUnit.lostAt),
      ),
    );
  return new Set(rows.map((row) => row.unitId));
}

export async function getAvailability(
  input: { startsAt: string; endsAt: string },
  exec: Executor = getDb(),
) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    !Number.isFinite(endsAt.getTime()) ||
    startsAt >= endsAt
  )
    throw new DomainError(t("T-4201"));
  const catalog = await readCatalog(exec);
  return Promise.all(
    catalog.map(async (item) => {
      const rows = await allocationsFor(item.id, exec);
      const busy =
        item.mode === "UNIT"
          ? await busyUnitIds(item.id, startsAt, endsAt, exec)
          : new Set<string>();
      const available =
        item.mode === "UNIT"
          ? item.units.filter((unit) => unit.state === "AVAILABLE" && !busy.has(unit.id)).length
          : Math.max(0, item.total - item.quarantined - peakReserved(rows, startsAt, endsAt));
      return { ...item, available: item.active ? available : 0 };
    }),
  );
}

export async function listReservations(
  personId: string,
  exec: Executor = getDb(),
): Promise<InventoryReservationView[]> {
  const access = await getInventoryContext(personId, exec);
  const [reservations, lines, assignments, items, units] = await Promise.all([
    exec.select().from(inventoryReservation).orderBy(asc(inventoryReservation.startsAt)),
    exec.select().from(inventoryReservationLine),
    exec.select().from(inventoryReservationUnit),
    exec.select().from(inventoryItem),
    exec.select().from(inventoryUnit),
  ]);
  const now = new Date();
  const conflicts = conflictedReservationIds(reservations, lines, assignments, items, units, now);
  return reservations.map((reservation) => ({
    ...reservation,
    canCancel:
      reservation.status === "CONFIRMED" &&
      (access.canManage || reservation.requesterId === personId),
    overdue: reservation.status === "OUT" && reservation.endsAt < now,
    conflicted: conflicts.has(reservation.id),
    lines: lines
      .filter((line) => line.reservationId === reservation.id)
      .map((line) => {
        const item = items.find((entry) => entry.id === line.itemId);
        if (!item) throw new DomainError(t("T-032"));
        const ids = assignments
          .filter((entry) => entry.lineId === line.id && !entry.returnedAt && !entry.lostAt)
          .map((entry) => entry.unitId);
        return {
          id: line.id,
          itemId: line.itemId,
          itemName: item.name,
          barcode: item.barcode,
          mode: item.mode,
          quantity: line.quantity,
          returned: line.returned,
          outstanding: outstanding(line.quantity, line.returned, line.lost),
          units: units
            .filter((unit) => ids.includes(unit.id))
            .map(({ id, barcode, state }) => ({ id, barcode, state })),
        };
      }),
  }));
}

export async function listIncidents(
  personId: string,
  exec: Executor = getDb(),
): Promise<InventoryIncidentView[]> {
  const access = await getInventoryContext(personId, exec);
  if (!access.canOperate) throw new DomainError(t("T-4200"));
  const rows = await exec
    .select({ incident: inventoryIncident, reservation: inventoryReservation })
    .from(inventoryIncident)
    .innerJoin(inventoryReservation, eq(inventoryReservation.id, inventoryIncident.reservationId));
  return rows.map(({ incident, reservation }) => ({
    ...incident,
    personName: reservation.collectorName,
    scopeLabel: reservation.scopeLabel,
  }));
}

/** La página de revisión exige ADMIN antes de esta lectura, como la Persona 360. */
export async function getIncidentForReview(
  incidentId: string,
  personId: string,
  exec: Executor = getDb(),
): Promise<InventoryIncidentView | null> {
  const [row] = await exec
    .select({ incident: inventoryIncident, reservation: inventoryReservation })
    .from(inventoryIncident)
    .innerJoin(inventoryReservation, eq(inventoryReservation.id, inventoryIncident.reservationId))
    .where(and(eq(inventoryIncident.id, incidentId), eq(inventoryIncident.personId, personId)));
  return row
    ? {
        ...row.incident,
        personName: row.reservation.collectorName,
        scopeLabel: row.reservation.scopeLabel,
      }
    : null;
}

/** Proyección propia para Mis datos: nunca incluye notas ni identificadores de otras personas. */
export async function exportOwnInventoryData(personId: string, exec: Executor = getDb()) {
  const own = or(
    eq(inventoryReservation.requesterId, personId),
    eq(inventoryReservation.collectorId, personId),
  );
  const [rows, inventoryMovements, inventoryIncidents] = await Promise.all([
    exec
      .select({
        id: inventoryReservation.id,
        requesterId: inventoryReservation.requesterId,
        collectorId: inventoryReservation.collectorId,
        scopeLabel: inventoryReservation.scopeLabel,
        startsAt: inventoryReservation.startsAt,
        endsAt: inventoryReservation.endsAt,
        status: inventoryReservation.status,
        itemId: inventoryReservationLine.itemId,
        quantity: inventoryReservationLine.quantity,
        returned: inventoryReservationLine.returned,
        lost: inventoryReservationLine.lost,
      })
      .from(inventoryReservation)
      .innerJoin(
        inventoryReservationLine,
        eq(inventoryReservationLine.reservationId, inventoryReservation.id),
      )
      .where(own)
      .orderBy(asc(inventoryReservation.id), asc(inventoryReservationLine.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    exec
      .select({
        id: inventoryMovement.id,
        reservationId: inventoryMovement.reservationId,
        kind: inventoryMovement.kind,
        createdAt: inventoryMovement.createdAt,
      })
      .from(inventoryMovement)
      .innerJoin(inventoryReservation, eq(inventoryReservation.id, inventoryMovement.reservationId))
      .where(own)
      .orderBy(asc(inventoryMovement.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    exec
      .select({
        id: inventoryIncident.id,
        reservationId: inventoryIncident.reservationId,
        status: inventoryIncident.status,
        createdAt: inventoryIncident.createdAt,
        referredAt: inventoryIncident.referredAt,
      })
      .from(inventoryIncident)
      .innerJoin(inventoryReservation, eq(inventoryReservation.id, inventoryIncident.reservationId))
      .where(own)
      .orderBy(asc(inventoryIncident.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  // Una fila por material reservado permite declarar el corte sin truncar líneas anidadas en silencio.
  const inventoryReservations = rows.map(({ requesterId, collectorId, ...row }) => ({
    ...row,
    asRequester: requesterId === personId,
    asCollector: collectorId === personId,
  }));
  return ownDataCollections({ inventoryReservations, inventoryMovements, inventoryIncidents });
}
