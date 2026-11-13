import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { eventEdition } from "@/modules/events/schema";
import { committee, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";

export const inventoryMode = pgEnum("inventory_mode", ["UNIT", "QUANTITY"]);
export const inventoryUnitState = pgEnum("inventory_unit_state", [
  "AVAILABLE",
  "QUARANTINED",
  "LOST",
]);
export const inventoryReservationStatus = pgEnum("inventory_reservation_status", [
  "CONFIRMED",
  "OUT",
  "RETURNED",
  "CANCELLED",
]);
export const inventoryIncidentStatus = pgEnum("inventory_incident_status", [
  "OPEN",
  "RESOLVED",
  "REFERRED",
]);

export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: id(),
    name: text().notNull(),
    code: text().notNull(),
    barcode: text().notNull(),
    mode: inventoryMode().notNull(),
    total: integer().notNull(),
    quarantined: integer().notNull().default(0),
    location: text().notNull(),
    box: text().notNull(),
    active: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("inventory_item_code_unique").on(t.code),
    uniqueIndex("inventory_item_barcode_unique").on(t.barcode),
    check(
      "inventory_item_stock_valid",
      sql`${t.total} >= 0 and ${t.quarantined} >= 0 and ${t.quarantined} <= ${t.total}`,
    ),
  ],
);

export const inventoryUnit = pgTable(
  "inventory_unit",
  {
    id: id(),
    itemId: text()
      .notNull()
      .references(() => inventoryItem.id),
    barcode: text().notNull(),
    state: inventoryUnitState().notNull().default("AVAILABLE"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inventory_unit_barcode_unique").on(t.barcode),
    index("inventory_unit_item_idx").on(t.itemId),
  ],
);

// La concesión conserva la fuente exacta: un cargo nuevo nunca hereda la del anterior.
export const inventoryGrant = pgTable(
  "inventory_grant",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id),
    sourceKind: text().notNull(),
    sourceId: text().notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    grantedById: text()
      .notNull()
      .references(() => person.id),
    revokedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inventory_grant_source_unique").on(t.sourceKind, t.sourceId),
    index("inventory_grant_person_idx").on(t.personId),
  ],
);

export const inventoryReservation = pgTable(
  "inventory_reservation",
  {
    id: id(),
    requesterId: text()
      .notNull()
      .references(() => person.id),
    requesterName: text().notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    sourceKind: text().notNull(),
    sourceId: text().notNull(),
    committeeId: text().references(() => committee.id),
    editionId: text().references(() => eventEdition.id),
    scopeLabel: text().notNull(),
    collectorId: text()
      .notNull()
      .references(() => person.id),
    collectorName: text().notNull(),
    startsAt: timestampTz().notNull(),
    endsAt: timestampTz().notNull(),
    status: inventoryReservationStatus().notNull().default("CONFIRMED"),
    checkedOutAt: timestampTz(),
    cancelledAt: timestampTz(),
    cancelReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_reservation_interval_idx").on(t.startsAt, t.endsAt),
    index("inventory_reservation_requester_idx").on(t.requesterId, t.status),
    check("inventory_reservation_interval_valid", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

export const inventoryReservationLine = pgTable(
  "inventory_reservation_line",
  {
    id: id(),
    reservationId: text()
      .notNull()
      .references(() => inventoryReservation.id),
    itemId: text()
      .notNull()
      .references(() => inventoryItem.id),
    quantity: integer().notNull(),
    returned: integer().notNull().default(0),
    lost: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("inventory_reservation_line_unique").on(t.reservationId, t.itemId),
    index("inventory_reservation_line_item_idx").on(t.itemId),
    check(
      "inventory_reservation_line_quantity_valid",
      sql`${t.quantity} > 0 and ${t.returned} >= 0 and ${t.lost} >= 0 and ${t.returned} + ${t.lost} <= ${t.quantity}`,
    ),
  ],
);

export const inventoryReservationUnit = pgTable(
  "inventory_reservation_unit",
  {
    id: id(),
    lineId: text()
      .notNull()
      .references(() => inventoryReservationLine.id),
    unitId: text()
      .notNull()
      .references(() => inventoryUnit.id),
    returnedAt: timestampTz(),
    lostAt: timestampTz(),
  },
  (t) => [
    uniqueIndex("inventory_reservation_unit_unique").on(t.lineId, t.unitId),
    index("inventory_reservation_unit_unit_idx").on(t.unitId),
  ],
);

// Una solicitud confirmada una vez conserva el mismo resultado ante un reintento de red.
export const inventoryMovement = pgTable(
  "inventory_movement",
  {
    id: id(),
    reservationId: text()
      .notNull()
      .references(() => inventoryReservation.id),
    requestId: text().notNull(),
    kind: text().notNull(),
    actorId: text()
      .notNull()
      .references(() => person.id),
    fingerprint: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inventory_movement_request_unique").on(t.requestId),
    index("inventory_movement_reservation_idx").on(t.reservationId),
  ],
);

export const inventoryIncident = pgTable(
  "inventory_incident",
  {
    id: id(),
    reservationId: text()
      .notNull()
      .references(() => inventoryReservation.id),
    personId: text()
      .notNull()
      .references(() => person.id),
    note: text().notNull(),
    management: text().notNull().default(""),
    status: inventoryIncidentStatus().notNull().default("OPEN"),
    createdById: text()
      .notNull()
      .references(() => person.id),
    referredAt: timestampTz(),
    referredById: text().references(() => person.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("inventory_incident_reservation_idx").on(t.reservationId),
    index("inventory_incident_status_idx").on(t.status),
  ],
);
