import { eq } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { inventoryIncidentReferred } from "@/domain-events/inventory";
import { lockPersonAnonymization } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventoryIncident, inventoryReservation } from "../schema";
import { assertManager, assertOperator, lockActors } from "./access";

const noteSchema = z.object({
  reservationId: z.string().min(1).max(160),
  note: z.string().trim().min(5).max(2000),
});
export type RecordIncidentInput = z.input<typeof noteSchema>;
const managementSchema = z.object({
  incidentId: z.string().min(1).max(160),
  management: z.string().trim().min(5).max(4000),
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
});
export type ManageIncidentInput = z.input<typeof managementSchema>;

export async function recordIncident(
  ctx: CommandContext,
  raw: RecordIncidentInput,
): Promise<{ id: string }> {
  const input = noteSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertOperator(actorId, ctx.tx);
  const [reservation] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, input.reservationId));
  if (!reservation || !["OUT", "RETURNED"].includes(reservation.status))
    throw new DomainError(t("T-4207"));
  const subject = await lockPersonAnonymization(ctx.tx, reservation.collectorId);
  if (!subject || subject.anonymized) throw new DomainError(t("T-032"));
  const [incident] = await ctx.tx
    .insert(inventoryIncident)
    .values({ ...input, personId: reservation.collectorId, createdById: actorId })
    .returning({ id: inventoryIncident.id });
  if (!incident) throw new Error("No se pudo registrar la incidencia");
  await ctx.audit({
    action: "inventory.incident-created",
    entityType: "inventory_incident",
    entityId: incident.id,
    after: { reservationId: reservation.id },
  });
  return incident;
}

export async function manageIncident(ctx: CommandContext, raw: ManageIncidentInput): Promise<void> {
  const input = managementSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const [incident] = await ctx.tx
    .select()
    .from(inventoryIncident)
    .where(eq(inventoryIncident.id, input.incidentId))
    .for("update");
  if (!incident) throw new DomainError(t("T-032"));
  const subject = await lockPersonAnonymization(ctx.tx, incident.personId);
  if (!subject || subject.anonymized) throw new DomainError(t("T-032"));
  const status = incident.referredAt ? "REFERRED" : (input.status ?? incident.status);
  await ctx.tx
    .update(inventoryIncident)
    .set({ management: input.management, status })
    .where(eq(inventoryIncident.id, incident.id));
  await ctx.audit({
    action: "inventory.incident-managed",
    entityType: "inventory_incident",
    entityId: incident.id,
    after: { status },
  });
}

export async function referIncident(
  ctx: CommandContext,
  input: { incidentId: string },
): Promise<void> {
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const [incident] = await ctx.tx
    .select()
    .from(inventoryIncident)
    .where(eq(inventoryIncident.id, input.incidentId))
    .for("update");
  if (!incident) throw new DomainError(t("T-032"));
  if (incident.referredAt) return;
  if (!incident.management.trim()) throw new DomainError(t("T-4212"));
  const [reservation] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, incident.reservationId));
  if (!reservation) throw new DomainError(t("T-032"));
  await ctx.tx
    .update(inventoryIncident)
    .set({ status: "REFERRED", referredAt: new Date(), referredById: actorId })
    .where(eq(inventoryIncident.id, incident.id));
  await ctx.emit(
    eventOf(inventoryIncidentReferred, {
      incidentId: incident.id,
      reservationId: reservation.id,
      personId: incident.personId,
      actorId,
      termId: reservation.termId,
      committeeId: reservation.committeeId,
    }),
  );
  await ctx.audit({
    action: "inventory.incident-referred",
    entityType: "inventory_incident",
    entityId: incident.id,
    after: { reservationId: reservation.id },
  });
}
