export const INVENTORY_MODES = ["UNIT", "QUANTITY"] as const;
export type InventoryMode = (typeof INVENTORY_MODES)[number];
export const INVENTORY_SOURCE_KINDS = ["COMMITTEE_ASSIGNMENT", "MACROEVENT_APPOINTMENT"] as const;
export type InventorySourceKind = (typeof INVENTORY_SOURCE_KINDS)[number];
export interface InventoryUnitView {
  id: string;
  barcode: string;
  state: "AVAILABLE" | "QUARANTINED" | "LOST";
}
export interface InventoryItemView {
  id: string;
  name: string;
  code: string;
  barcode: string;
  mode: InventoryMode;
  total: number;
  quarantined: number;
  location: string;
  box: string;
  active: boolean;
  units: InventoryUnitView[];
}
export interface InventorySourceView {
  id: string;
  kind: InventorySourceKind;
  personId: string;
  termId: string;
  committeeId: string | null;
  editionId: string | null;
  label: string;
  live: boolean;
  granted: boolean;
}
export interface InventoryContext {
  canManage: boolean;
  canOperate: boolean;
  isCml: boolean;
  canReserve: boolean;
  termId: string | null;
  sources: InventorySourceView[];
}
export interface ReservationLineView {
  id: string;
  itemId: string;
  itemName: string;
  barcode: string;
  mode: InventoryMode;
  quantity: number;
  outstanding: number;
  returned: number;
  units: InventoryUnitView[];
}
export interface InventoryReservationView {
  id: string;
  requesterId: string;
  requesterName: string;
  scopeLabel: string;
  committeeId: string | null;
  editionId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: "CONFIRMED" | "OUT" | "RETURNED" | "CANCELLED";
  collectorId: string;
  collectorName: string;
  canCancel: boolean;
  overdue: boolean;
  conflicted: boolean;
  lines: ReservationLineView[];
}
export interface InventoryIncidentView {
  id: string;
  reservationId: string;
  personId: string;
  personName: string;
  scopeLabel: string;
  note: string;
  management: string;
  status: "OPEN" | "RESOLVED" | "REFERRED";
  createdAt: Date;
  referredAt: Date | null;
}
