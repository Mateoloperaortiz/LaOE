import { type Actor, runCommand } from "@/db/tx";
import {
  type AdjustStockInput,
  adjustStock,
  type CreateItemInput,
  createItem,
  type UpdateItemInput,
  updateItem,
} from "./domain/catalog";
import {
  type ManageIncidentInput,
  manageIncident,
  type RecordIncidentInput,
  recordIncident,
  referIncident,
} from "./domain/incidents";
import {
  type CheckoutInput,
  checkout,
  type ReturnInput,
  returnItems,
  type WriteOffInput,
  writeOff,
} from "./domain/movements";
import {
  type CancelReservationInput,
  cancelReservation,
  type ReservationGrantInput,
  type ReserveInput,
  reserve,
  setReservationGrant,
} from "./domain/reservations";

export { getInventoryContext } from "./domain/access";
export {
  exportOwnInventoryData,
  getAvailability,
  getIncidentForReview,
  listIncidents,
  listReservations,
  readCatalog,
} from "./domain/reads";
export type {
  InventoryItemView,
  InventoryReservationView,
} from "./domain/types";
export const createItemAs = (actor: Actor, input: CreateItemInput) =>
  runCommand(actor, (ctx) => createItem(ctx, input));
export const updateItemAs = (actor: Actor, input: UpdateItemInput) =>
  runCommand(actor, (ctx) => updateItem(ctx, input));
export const adjustStockAs = (actor: Actor, input: AdjustStockInput) =>
  runCommand(actor, (ctx) => adjustStock(ctx, input));
export const setReservationGrantAs = (actor: Actor, input: ReservationGrantInput) =>
  runCommand(actor, (ctx) => setReservationGrant(ctx, input));
export const reserveAs = (actor: Actor, input: ReserveInput) =>
  runCommand(actor, (ctx) => reserve(ctx, input));
export const cancelReservationAs = (actor: Actor, input: CancelReservationInput) =>
  runCommand(actor, (ctx) => cancelReservation(ctx, input));
export const checkoutAs = (actor: Actor, input: CheckoutInput) =>
  runCommand(actor, (ctx) => checkout(ctx, input));
export const returnAs = (actor: Actor, input: ReturnInput) =>
  runCommand(actor, (ctx) => returnItems(ctx, input));
export const writeOffAs = (actor: Actor, input: WriteOffInput) =>
  runCommand(actor, (ctx) => writeOff(ctx, input));
export const recordIncidentAs = (actor: Actor, input: RecordIncidentInput) =>
  runCommand(actor, (ctx) => recordIncident(ctx, input));
export const manageIncidentAs = (actor: Actor, input: ManageIncidentInput) =>
  runCommand(actor, (ctx) => manageIncident(ctx, input));
export const referIncidentAs = (actor: Actor, input: { incidentId: string }) =>
  runCommand(actor, (ctx) => referIncident(ctx, input));
