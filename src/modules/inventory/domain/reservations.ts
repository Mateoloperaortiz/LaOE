import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext, Tx } from "@/db/tx";
import {
  canParticipate,
  getMembershipRef,
  getPersonRecord,
  isInInternalRoster,
  resolveLogisticsSource,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  inventoryGrant,
  inventoryItem,
  inventoryReservation,
  inventoryReservationLine,
  inventoryReservationUnit,
  inventoryUnit,
} from "../schema";
import { assertManager, getInventoryContext, hasReservationGrant, lockActors } from "./access";
import { peakReserved } from "./availability-pure";
import { allocationsFor, busyUnitIds } from "./reads";
import { INVENTORY_SOURCE_KINDS } from "./types";

const source = z.object({
  sourceKind: z.enum(INVENTORY_SOURCE_KINDS),
  sourceId: z.string().min(1).max(160),
});
const grantSchema = source.extend({ enabled: z.boolean() });
export type ReservationGrantInput = z.input<typeof grantSchema>;
const reserveSchema = source.extend({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  collectorId: z.string().min(1).max(160).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1).max(160),
        quantity: z.number().int().min(1).max(10000),
      }),
    )
    .min(1)
    .max(100),
});
export type ReserveInput = z.input<typeof reserveSchema>;
export type CancelReservationInput = { reservationId: string; reason?: string };
const cancelSchema = z.object({
  reservationId: z.string().min(1).max(160),
  reason: z.string().trim().max(1000).optional(),
});

export async function lockItems(tx: Tx, ids: string[]) {
  const rows = [];
  for (const id of [...new Set(ids)].sort()) {
    const [row] = await tx
      .select()
      .from(inventoryItem)
      .where(eq(inventoryItem.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    rows.push(row);
  }
  return rows;
}

export async function assertCollector(
  tx: Tx,
  collectorId: string,
  sourceRef: { requesterId: string; committeeId: string | null; termId: string },
  requireUid: boolean,
): Promise<string> {
  const [member, person] = await Promise.all([
    getMembershipRef(collectorId, tx),
    getPersonRecord(collectorId, tx),
  ]);
  if (!person || !canParticipate(member?.status)) throw new DomainError(t("T-4204"));
  if (sourceRef.committeeId) {
    if (
      !(await isInInternalRoster(tx, collectorId, {
        committeeId: sourceRef.committeeId,
        termId: sourceRef.termId,
      }))
    )
      throw new DomainError(t("T-4204"));
  } else if (collectorId !== sourceRef.requesterId) throw new DomainError(t("T-4204"));
  if (requireUid && !person.cardUid) throw new DomainError(t("T-4205"));
  return person.fullName ?? `${person.firstName} ${person.lastName}`;
}

export async function setReservationGrant(
  ctx: CommandContext,
  raw: ReservationGrantInput,
): Promise<void> {
  const input = grantSchema.parse(raw);
  const preliminary = await resolveLogisticsSource(
    { kind: input.sourceKind, id: input.sourceId },
    ctx.tx,
  );
  const actorId = await lockActors(ctx.tx, ctx.actor, preliminary ? [preliminary.personId] : []);
  await assertManager(actorId, ctx.tx);
  const resolved = await resolveLogisticsSource(
    { kind: input.sourceKind, id: input.sourceId },
    ctx.tx,
  );
  const [existing] = await ctx.tx
    .select()
    .from(inventoryGrant)
    .where(
      and(
        eq(inventoryGrant.sourceKind, input.sourceKind),
        eq(inventoryGrant.sourceId, input.sourceId),
      ),
    );
  if (!resolved?.live && input.enabled) throw new DomainError(t("T-4206"));
  if (!resolved && !existing) throw new DomainError(t("T-032"));
  if (existing) {
    await ctx.tx
      .update(inventoryGrant)
      .set({ revokedAt: input.enabled ? null : new Date(), grantedById: actorId })
      .where(eq(inventoryGrant.id, existing.id));
  } else if (resolved) {
    await ctx.tx.insert(inventoryGrant).values({
      personId: resolved.personId,
      termId: resolved.termId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      grantedById: actorId,
      revokedAt: input.enabled ? null : new Date(),
    });
  }
  await ctx.audit({
    action: "inventory.grant-changed",
    entityType: "inventory_source",
    entityId: input.sourceId,
    after: input,
  });
}

export async function reserve(ctx: CommandContext, raw: ReserveInput): Promise<{ id: string }> {
  const input = reserveSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor, input.collectorId ? [input.collectorId] : []);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (startsAt >= endsAt || endsAt <= new Date() || startsAt < new Date())
    throw new DomainError(t("T-4201"));
  if (new Set(input.lines.map((line) => line.itemId)).size !== input.lines.length)
    throw new DomainError(t("T-4202"));
  // Revocar y reservar comparten el ciclo del destinatario y este lock de la fuente.
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`inventory-source:${input.sourceKind}:${input.sourceId}`}, 0))`,
  );
  const resolved = await resolveLogisticsSource(
    { kind: input.sourceKind, id: input.sourceId },
    ctx.tx,
  );
  if (
    !resolved?.live ||
    resolved.personId !== actorId ||
    !(await hasReservationGrant(actorId, input.sourceKind, input.sourceId, ctx.tx))
  )
    throw new DomainError(t("T-4206"));
  const collectorId = input.collectorId ?? actorId;
  const collectorName = await assertCollector(
    ctx.tx,
    collectorId,
    { requesterId: actorId, committeeId: resolved.committeeId, termId: resolved.termId },
    false,
  );
  const requester = await getPersonRecord(actorId, ctx.tx);
  if (!requester) throw new DomainError(t("T-032"));
  const items = await lockItems(
    ctx.tx,
    input.lines.map((line) => line.itemId),
  );
  const unitsByItem = new Map<string, string[]>();
  for (const line of input.lines) {
    const item = items.find((entry) => entry.id === line.itemId);
    if (!item?.active) throw new DomainError(t("T-4203"));
    const allocations = await allocationsFor(item.id, ctx.tx);
    if (peakReserved(allocations, startsAt, endsAt) + line.quantity > item.total - item.quarantined)
      throw new DomainError(t("T-4203"));
    if (item.mode === "UNIT") {
      const busy = await busyUnitIds(item.id, startsAt, endsAt, ctx.tx);
      const units = await ctx.tx
        .select()
        .from(inventoryUnit)
        .where(and(eq(inventoryUnit.itemId, item.id), eq(inventoryUnit.state, "AVAILABLE")));
      const selected = units
        .filter((unit) => !busy.has(unit.id))
        .slice(0, line.quantity)
        .map((unit) => unit.id);
      if (selected.length !== line.quantity) throw new DomainError(t("T-4203"));
      unitsByItem.set(item.id, selected);
    }
  }
  const [reservation] = await ctx.tx
    .insert(inventoryReservation)
    .values({
      requesterId: actorId,
      requesterName: requester.fullName ?? `${requester.firstName} ${requester.lastName}`,
      termId: resolved.termId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      committeeId: resolved.committeeId,
      editionId: resolved.editionId,
      scopeLabel: resolved.label,
      collectorId,
      collectorName,
      startsAt,
      endsAt,
    })
    .returning();
  if (!reservation) throw new Error("No se pudo crear la reserva");
  for (const line of input.lines) {
    const [created] = await ctx.tx
      .insert(inventoryReservationLine)
      .values({ reservationId: reservation.id, ...line })
      .returning();
    if (!created) throw new Error("No se pudo crear la línea de reserva");
    const units = unitsByItem.get(line.itemId) ?? [];
    if (units.length)
      await ctx.tx
        .insert(inventoryReservationUnit)
        .values(units.map((unitId) => ({ lineId: created.id, unitId })));
  }
  await ctx.audit({
    action: "inventory.reserved",
    entityType: "inventory_reservation",
    entityId: reservation.id,
    after: { ...input, collectorId },
  });
  return { id: reservation.id };
}

export async function cancelReservation(
  ctx: CommandContext,
  raw: CancelReservationInput,
): Promise<void> {
  const input = cancelSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  const access = await getInventoryContext(actorId, ctx.tx);
  const [row] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, input.reservationId))
    .for("update");
  if (!row || (!access.canManage && row.requesterId !== actorId)) throw new DomainError(t("T-032"));
  if (row.status === "CANCELLED") return;
  if (row.status !== "CONFIRMED") throw new DomainError(t("T-4207"));
  const reason = input.reason?.trim() ?? "";
  if (access.canManage && reason.length < 5) throw new DomainError(t("T-4208"));
  const lines = await ctx.tx
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, row.id));
  await lockItems(
    ctx.tx,
    lines.map((line) => line.itemId),
  );
  await ctx.tx
    .update(inventoryReservation)
    .set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason })
    .where(eq(inventoryReservation.id, row.id));
  await ctx.audit({
    action: "inventory.cancelled",
    entityType: "inventory_reservation",
    entityId: row.id,
    after: { reason },
  });
}
