import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { lockPersonAnonymization } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  inventoryIncident,
  inventoryItem,
  inventoryMovement,
  inventoryReservation,
  inventoryReservationLine,
  inventoryReservationUnit,
  inventoryUnit,
} from "../schema";
import { assertManager, assertOperator, lockActors } from "./access";
import { outstanding } from "./availability-pure";
import { allocationsFor } from "./reads";
import { assertCollector, lockItems } from "./reservations";

const checkoutSchema = z.object({
  reservationId: z.string().min(1).max(160),
  requestId: z.string().min(8).max(160),
  collectorId: z.string().min(1).max(160),
  barcodes: z.array(z.string().min(1).max(160)).min(1).max(10000),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;
const returnSchema = z.object({
  reservationId: z.string().min(1).max(160),
  requestId: z.string().min(8).max(160),
  note: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1).max(160),
        quantity: z.number().int().min(1).max(10000),
        damagedQuantity: z.number().int().min(0).max(10000).default(0),
        unitIds: z.array(z.string().min(1).max(160)).max(10000).default([]),
        damagedUnitIds: z.array(z.string().min(1).max(160)).max(10000).default([]),
      }),
    )
    .min(1)
    .max(100),
});
export type ReturnInput = z.input<typeof returnSchema>;
const writeOffSchema = z.object({
  requestId: z.string().min(8).max(160),
  reservationId: z.string().min(1).max(160),
  lineId: z.string().min(1).max(160),
  quantity: z.number().int().min(1).max(10000),
  unitIds: z.array(z.string().min(1).max(160)).max(10000).default([]),
  reason: z.string().trim().min(5).max(2000),
});
export type WriteOffInput = z.input<typeof writeOffSchema>;

async function movementAlreadyRecorded(
  ctx: CommandContext,
  requestId: string,
  reservationId: string,
  kind: string,
  fingerprint: string,
): Promise<boolean> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`inventory-movement:${requestId}`}, 0))`,
  );
  const [existing] = await ctx.tx
    .select()
    .from(inventoryMovement)
    .where(eq(inventoryMovement.requestId, requestId));
  if (!existing) return false;
  if (
    existing.reservationId !== reservationId ||
    existing.kind !== kind ||
    existing.fingerprint !== fingerprint ||
    existing.actorId !== ctx.actor.personId
  )
    throw new DomainError(t("T-4210"));
  return true;
}

async function recordMovement(
  ctx: CommandContext,
  requestId: string,
  reservationId: string,
  kind: string,
  fingerprint: string,
  actorId: string,
  facts: unknown,
) {
  await ctx.tx
    .insert(inventoryMovement)
    .values({ requestId, reservationId, kind, fingerprint, actorId });
  await ctx.audit({
    action: `inventory.${kind.toLowerCase()}`,
    entityType: "inventory_reservation",
    entityId: reservationId,
    after: { requestId, details: facts },
  });
}

async function closeIfReturned(ctx: CommandContext, reservationId: string): Promise<void> {
  const lines = await ctx.tx
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, reservationId));
  if (lines.every((line) => outstanding(line.quantity, line.returned, line.lost) === 0))
    await ctx.tx
      .update(inventoryReservation)
      .set({ status: "RETURNED" })
      .where(eq(inventoryReservation.id, reservationId));
}

export async function checkout(ctx: CommandContext, raw: CheckoutInput): Promise<void> {
  const input = checkoutSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor, [input.collectorId]);
  await assertOperator(actorId, ctx.tx);
  const facts = {
    collectorId: input.collectorId,
    barcodes: [...input.barcodes].sort(),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
  if (
    await movementAlreadyRecorded(
      ctx,
      input.requestId,
      input.reservationId,
      "CHECKOUT",
      fingerprint,
    )
  )
    return;
  const [reservation] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, input.reservationId))
    .for("update");
  if (!reservation) throw new DomainError(t("T-032"));
  const now = new Date();
  if (reservation.status !== "CONFIRMED" || reservation.startsAt > now || reservation.endsAt <= now)
    throw new DomainError(t("T-4207"));
  const collectorName = await assertCollector(ctx.tx, input.collectorId, reservation, true);
  const lines = await ctx.tx
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, reservation.id));
  const items = await lockItems(
    ctx.tx,
    lines.map((line) => line.itemId),
  );
  const expected: string[] = [];
  for (const line of lines) {
    const item = items.find((row) => row.id === line.itemId);
    if (!item) throw new DomainError(t("T-032"));
    const allocations = await allocationsFor(item.id, ctx.tx);
    const physicallyOut = allocations
      .filter((row) => row.status === "OUT")
      .reduce((total, row) => total + row.quantity, 0);
    if (item.total - item.quarantined - physicallyOut < line.quantity)
      throw new DomainError(t("T-4203"));
    if (item.mode === "UNIT") {
      const assignments = await ctx.tx
        .select({ unit: inventoryUnit })
        .from(inventoryReservationUnit)
        .innerJoin(inventoryUnit, eq(inventoryUnit.id, inventoryReservationUnit.unitId))
        .where(eq(inventoryReservationUnit.lineId, line.id));
      if (
        assignments.length !== line.quantity ||
        assignments.some(({ unit }) => unit.state !== "AVAILABLE")
      )
        throw new DomainError(t("T-4203"));
      const otherOut = allocations.filter((row) => row.status === "OUT").map((row) => row.id);
      if (otherOut.length) {
        const busy = await ctx.tx
          .select({ unitId: inventoryReservationUnit.unitId })
          .from(inventoryReservationUnit)
          .where(
            and(
              inArray(inventoryReservationUnit.lineId, otherOut),
              isNull(inventoryReservationUnit.returnedAt),
              isNull(inventoryReservationUnit.lostAt),
            ),
          );
        if (assignments.some(({ unit }) => busy.some((row) => row.unitId === unit.id)))
          throw new DomainError(t("T-4203"));
      }
      expected.push(...assignments.map(({ unit }) => unit.barcode));
    } else expected.push(item.barcode);
  }
  if (
    input.barcodes.length !== expected.length ||
    new Set(input.barcodes).size !== expected.length ||
    expected.some((barcode) => !input.barcodes.includes(barcode))
  )
    throw new DomainError(t("T-4211"));
  await ctx.tx
    .update(inventoryReservation)
    .set({ status: "OUT", checkedOutAt: now, collectorId: input.collectorId, collectorName })
    .where(eq(inventoryReservation.id, reservation.id));
  await recordMovement(
    ctx,
    input.requestId,
    reservation.id,
    "CHECKOUT",
    fingerprint,
    actorId,
    facts,
  );
}

export async function returnItems(ctx: CommandContext, raw: ReturnInput): Promise<void> {
  const input = returnSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertOperator(actorId, ctx.tx);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        note: input.note ?? "",
        lines: input.lines
          .map((line) => ({
            ...line,
            unitIds: [...line.unitIds].sort(),
            damagedUnitIds: [...line.damagedUnitIds].sort(),
          }))
          .sort((a, b) => a.lineId.localeCompare(b.lineId)),
      }),
    )
    .digest("hex");
  if (
    await movementAlreadyRecorded(ctx, input.requestId, input.reservationId, "RETURN", fingerprint)
  )
    return;
  const [reservation] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, input.reservationId))
    .for("update");
  if (!reservation) throw new DomainError(t("T-032"));
  if (reservation.status !== "OUT") throw new DomainError(t("T-4207"));
  if (new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length)
    throw new DomainError(t("T-4202"));
  const lines = await ctx.tx
    .select()
    .from(inventoryReservationLine)
    .where(eq(inventoryReservationLine.reservationId, reservation.id));
  const items = await lockItems(
    ctx.tx,
    lines.map((line) => line.itemId),
  );
  for (const returned of input.lines) {
    const line = lines.find((row) => row.id === returned.lineId);
    if (!line) throw new DomainError(t("T-032"));
    const item = items.find((row) => row.id === line.itemId);
    if (!item) throw new DomainError(t("T-032"));
    if (
      returned.quantity > outstanding(line.quantity, line.returned, line.lost) ||
      returned.damagedQuantity > returned.quantity
    )
      throw new DomainError(t("T-4202"));
    if (returned.damagedQuantity && (!input.note || input.note.length < 5))
      throw new DomainError(t("T-4209"));
    if (item.mode === "UNIT") {
      if (
        new Set(returned.unitIds).size !== returned.quantity ||
        returned.unitIds.length !== returned.quantity ||
        new Set(returned.damagedUnitIds).size !== returned.damagedQuantity ||
        returned.damagedUnitIds.length !== returned.damagedQuantity ||
        returned.damagedUnitIds.some((id) => !returned.unitIds.includes(id))
      )
        throw new DomainError(t("T-4211"));
      const assignments = await ctx.tx
        .select()
        .from(inventoryReservationUnit)
        .where(
          and(
            eq(inventoryReservationUnit.lineId, line.id),
            inArray(inventoryReservationUnit.unitId, returned.unitIds),
            isNull(inventoryReservationUnit.returnedAt),
            isNull(inventoryReservationUnit.lostAt),
          ),
        );
      if (assignments.length !== returned.quantity) throw new DomainError(t("T-4211"));
      await ctx.tx
        .update(inventoryReservationUnit)
        .set({ returnedAt: new Date() })
        .where(
          inArray(
            inventoryReservationUnit.id,
            assignments.map((row) => row.id),
          ),
        );
      const damagedIds = returned.damagedUnitIds;
      if (damagedIds.length)
        await ctx.tx
          .update(inventoryUnit)
          .set({ state: "QUARANTINED" })
          .where(inArray(inventoryUnit.id, damagedIds));
    } else if (returned.unitIds.length || returned.damagedUnitIds.length)
      throw new DomainError(t("T-4202"));
    await ctx.tx
      .update(inventoryReservationLine)
      .set({ returned: line.returned + returned.quantity })
      .where(eq(inventoryReservationLine.id, line.id));
    if (returned.damagedQuantity)
      await ctx.tx
        .update(inventoryItem)
        .set({ quarantined: item.quarantined + returned.damagedQuantity })
        .where(eq(inventoryItem.id, item.id));
  }
  if (input.note) {
    const subject = await lockPersonAnonymization(ctx.tx, reservation.collectorId);
    if (!subject || subject.anonymized) throw new DomainError(t("T-032"));
    await ctx.tx.insert(inventoryIncident).values({
      reservationId: reservation.id,
      personId: reservation.collectorId,
      note: input.note,
      createdById: actorId,
    });
  }
  await closeIfReturned(ctx, reservation.id);
  await recordMovement(ctx, input.requestId, reservation.id, "RETURN", fingerprint, actorId, {
    lines: input.lines,
  });
}

export async function writeOff(ctx: CommandContext, raw: WriteOffInput): Promise<void> {
  const input = writeOffSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...input, unitIds: [...input.unitIds].sort() }))
    .digest("hex");
  if (await movementAlreadyRecorded(ctx, input.requestId, input.reservationId, "LOSS", fingerprint))
    return;
  const [reservation] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(eq(inventoryReservation.id, input.reservationId))
    .for("update");
  if (!reservation || reservation.status !== "OUT") throw new DomainError(t("T-4207"));
  const [line] = await ctx.tx
    .select()
    .from(inventoryReservationLine)
    .where(
      and(
        eq(inventoryReservationLine.id, input.lineId),
        eq(inventoryReservationLine.reservationId, reservation.id),
      ),
    );
  if (!line) throw new DomainError(t("T-032"));
  const [item] = await lockItems(ctx.tx, [line.itemId]);
  if (!item || input.quantity > outstanding(line.quantity, line.returned, line.lost))
    throw new DomainError(t("T-4202"));
  if (item.mode === "UNIT") {
    if (new Set(input.unitIds).size !== input.quantity || input.unitIds.length !== input.quantity)
      throw new DomainError(t("T-4211"));
    const units = await ctx.tx
      .select()
      .from(inventoryReservationUnit)
      .where(
        and(
          eq(inventoryReservationUnit.lineId, line.id),
          inArray(inventoryReservationUnit.unitId, input.unitIds),
          isNull(inventoryReservationUnit.returnedAt),
          isNull(inventoryReservationUnit.lostAt),
        ),
      );
    if (units.length !== input.quantity) throw new DomainError(t("T-4211"));
    await ctx.tx
      .update(inventoryReservationUnit)
      .set({ lostAt: new Date() })
      .where(
        inArray(
          inventoryReservationUnit.id,
          units.map((unit) => unit.id),
        ),
      );
    await ctx.tx
      .update(inventoryUnit)
      .set({ state: "LOST" })
      .where(inArray(inventoryUnit.id, input.unitIds));
  } else if (input.unitIds.length) throw new DomainError(t("T-4202"));
  await ctx.tx
    .update(inventoryItem)
    .set({ total: item.total - input.quantity })
    .where(eq(inventoryItem.id, item.id));
  await ctx.tx
    .update(inventoryReservationLine)
    .set({ lost: line.lost + input.quantity })
    .where(eq(inventoryReservationLine.id, line.id));
  await closeIfReturned(ctx, reservation.id);
  await recordMovement(ctx, input.requestId, reservation.id, "LOSS", fingerprint, actorId, {
    lineId: line.id,
    quantity: input.quantity,
    unitIds: input.unitIds,
  });
  await ctx.audit({
    action: "inventory.loss-recorded",
    entityType: "inventory_reservation",
    entityId: reservation.id,
    after: input,
  });
}
