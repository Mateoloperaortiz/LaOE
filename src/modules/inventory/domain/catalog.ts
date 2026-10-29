import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventoryItem, inventoryUnit } from "../schema";
import { assertManager, lockActors } from "./access";
import { peakReserved } from "./availability-pure";
import { allocationsFor, busyUnitIds } from "./reads";
import { INVENTORY_MODES } from "./types";

const fields = z.object({
  name: z.string().trim().min(2).max(160),
  location: z.string().trim().min(1).max(160),
  box: z.string().trim().min(1).max(160),
});
const createSchema = fields.extend({
  mode: z.enum(INVENTORY_MODES),
  total: z.number().int().min(1).max(10000),
});
export type CreateItemInput = z.input<typeof createSchema>;
const updateSchema = fields.extend({ itemId: z.string().min(1).max(160), active: z.boolean() });
export type UpdateItemInput = z.input<typeof updateSchema>;
const adjustSchema = z.object({
  itemId: z.string().min(1).max(160),
  delta: z.number().int().min(-10000).max(10000),
  reason: z.string().trim().min(5).max(1000),
  releaseQuarantine: z.number().int().min(0).max(10000).default(0),
  unitIds: z.array(z.string().min(1).max(160)).max(10000).default([]),
});
export type AdjustStockInput = z.input<typeof adjustSchema>;

async function addUnits(ctx: CommandContext, itemId: string, quantity: number): Promise<void> {
  if (quantity)
    await ctx.tx.insert(inventoryUnit).values(
      Array.from({ length: quantity }, () => ({
        itemId,
        barcode: `OE-U-${createId().toUpperCase()}`,
      })),
    );
}

export async function createItem(
  ctx: CommandContext,
  raw: CreateItemInput,
): Promise<{ id: string }> {
  const input = createSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const code = `OE-I-${createId().toUpperCase()}`;
  const [item] = await ctx.tx
    .insert(inventoryItem)
    .values({ ...input, code, barcode: code })
    .returning();
  if (!item) throw new Error("No se pudo crear el implemento");
  if (input.mode === "UNIT") await addUnits(ctx, item.id, input.total);
  await ctx.audit({
    action: "inventory.item-created",
    entityType: "inventory_item",
    entityId: item.id,
    after: input,
  });
  return { id: item.id };
}

export async function updateItem(ctx: CommandContext, raw: UpdateItemInput): Promise<void> {
  const input = updateSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const [item] = await ctx.tx
    .select()
    .from(inventoryItem)
    .where(eq(inventoryItem.id, input.itemId))
    .for("update");
  if (!item) throw new DomainError(t("T-032"));
  const after = {
    name: input.name,
    location: input.location,
    box: input.box,
    active: input.active ? 1 : 0,
  };
  await ctx.tx.update(inventoryItem).set(after).where(eq(inventoryItem.id, item.id));
  await ctx.audit({
    action: "inventory.item-updated",
    entityType: "inventory_item",
    entityId: item.id,
    before: item,
    after,
  });
}

export async function adjustStock(ctx: CommandContext, raw: AdjustStockInput): Promise<void> {
  const input = adjustSchema.parse(raw);
  const actorId = await lockActors(ctx.tx, ctx.actor);
  await assertManager(actorId, ctx.tx);
  const [item] = await ctx.tx
    .select()
    .from(inventoryItem)
    .where(eq(inventoryItem.id, input.itemId))
    .for("update");
  if (!item) throw new DomainError(t("T-032"));
  const total = item.total + input.delta;
  const quarantined = item.quarantined - input.releaseQuarantine;
  if (
    total < 0 ||
    quarantined < 0 ||
    total < quarantined ||
    new Set(input.unitIds).size !== input.unitIds.length
  )
    throw new DomainError(t("T-4202"));
  const now = new Date();
  const allocations = await allocationsFor(item.id, ctx.tx, now);
  if (peakReserved(allocations, now, new Date(8640000000000000)) > total - quarantined)
    throw new DomainError(t("T-4203"));
  if (item.mode === "UNIT") {
    if (input.delta > 0 && input.unitIds.length) throw new DomainError(t("T-4202"));
    if (input.delta < 0 && input.releaseQuarantine) throw new DomainError(t("T-4202"));
    const expected = input.delta < 0 ? -input.delta : input.releaseQuarantine;
    if (input.unitIds.length !== expected) throw new DomainError(t("T-4202"));
    if (input.unitIds.length) {
      const units = await ctx.tx
        .select()
        .from(inventoryUnit)
        .where(and(eq(inventoryUnit.itemId, item.id), inArray(inventoryUnit.id, input.unitIds)));
      const expectedState = input.delta < 0 ? "AVAILABLE" : "QUARANTINED";
      const busy = await busyUnitIds(item.id, now, new Date(8640000000000000), ctx.tx);
      if (
        units.length !== expected ||
        units.some((unit) => unit.state !== expectedState || (input.delta < 0 && busy.has(unit.id)))
      )
        throw new DomainError(t("T-4203"));
      await ctx.tx
        .update(inventoryUnit)
        .set({ state: input.delta < 0 ? "LOST" : "AVAILABLE" })
        .where(inArray(inventoryUnit.id, input.unitIds));
    }
    if (input.delta > 0) await addUnits(ctx, item.id, input.delta);
  } else if (input.unitIds.length) throw new DomainError(t("T-4202"));
  await ctx.tx
    .update(inventoryItem)
    .set({ total, quarantined })
    .where(eq(inventoryItem.id, item.id));
  await ctx.audit({
    action: "inventory.stock-adjusted",
    entityType: "inventory_item",
    entityId: item.id,
    before: { total: item.total, quarantined: item.quarantined },
    after: { total, quarantined, reason: input.reason, unitIds: input.unitIds },
  });
}
