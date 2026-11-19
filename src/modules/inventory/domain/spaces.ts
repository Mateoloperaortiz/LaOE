import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import {
  type BoardDecision,
  currentInventoryManagerRole,
  getPeopleByIds,
  listLogisticsSources,
  notifyApproval,
  readBoardDecision,
  requireApprovalAuthority,
  resolveLogisticsSource,
  seatDeciders,
} from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventorySpace, spaceBooking } from "../schema";
import { lockActors } from "./access";
import { INVENTORY_SOURCE_KINDS } from "./types";

const path = "/app/coordinacion";
const bookingInput = z.object({
  id: z.cuid2(),
  spaceId: z.cuid2(),
  sourceKind: z.enum(INVENTORY_SOURCE_KINDS),
  sourceId: z.string().min(1).max(160),
  startsAt: z.date(),
  endsAt: z.date(),
  purpose: z.string().trim().min(3).max(1000),
});

export function addSpaceAs(actor: Actor, rawName: string) {
  const name = z.string().trim().min(2).max(120).parse(rawName).replace(/\s+/g, " ");
  if (/\bvallas?\b/iu.test(name)) throw new DomainError(t("T-5200"));
  return runCommand(actor, async (ctx) => {
    await requireApprovalAuthority(ctx, "VP_ADMIN", new Date());
    const [added] = await ctx.tx
      .insert(inventorySpace)
      .values({ name })
      .onConflictDoNothing()
      .returning();
    if (added) {
      await ctx.audit({
        action: "inventory.space-added",
        entityType: "inventory_space",
        entityId: added.id,
        after: { name },
      });
      return added.id;
    }
    const [existing] = await ctx.tx
      .select()
      .from(inventorySpace)
      .where(sql`lower(${inventorySpace.name}) = lower(${name})`);
    if (!existing) throw new DomainError(t("T-5200"));
    return existing.id;
  });
}

export function setSpaceActiveAs(actor: Actor, id: string, active: boolean) {
  return runCommand(actor, async (ctx) => {
    await requireApprovalAuthority(ctx, "VP_ADMIN", new Date());
    const [row] = await ctx.tx
      .select()
      .from(inventorySpace)
      .where(eq(inventorySpace.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-5200"));
    if (Boolean(row.active) === active) return;
    await ctx.tx
      .update(inventorySpace)
      .set({ active: active ? 1 : 0 })
      .where(eq(inventorySpace.id, id));
    await ctx.audit({
      action: "inventory.space-availability",
      entityType: "inventory_space",
      entityId: id,
      after: { active },
    });
  });
}

export function requestSpaceAs(actor: Actor, raw: z.input<typeof bookingInput>, now = new Date()) {
  const input = bookingInput.parse(raw);
  return runCommand(actor, async (ctx) => {
    const personId = await lockActors(ctx.tx, actor);
    const [space] = await ctx.tx
      .select()
      .from(inventorySpace)
      .where(eq(inventorySpace.id, input.spaceId))
      .for("update");
    const [prior] = await ctx.tx.select().from(spaceBooking).where(eq(spaceBooking.id, input.id));
    if (prior) {
      if (
        prior.requesterId !== personId ||
        prior.spaceId !== input.spaceId ||
        prior.sourceKind !== input.sourceKind ||
        prior.sourceId !== input.sourceId ||
        prior.purpose !== input.purpose ||
        +prior.startsAt !== +input.startsAt ||
        +prior.endsAt !== +input.endsAt
      )
        throw new DomainError(t("T-5169"));
      return prior.id;
    }
    if (!space?.active) throw new DomainError(t("T-5200"));
    if (input.startsAt < now || input.startsAt >= input.endsAt) throw new DomainError(t("T-4201"));
    const source = await resolveLogisticsSource(
      { kind: input.sourceKind, id: input.sourceId },
      ctx.tx,
      now,
    );
    if (!source?.live || source.personId !== personId) throw new DomainError(t("T-4206"));
    await ctx.tx
      .insert(spaceBooking)
      .values({ ...input, requesterId: personId, scopeLabel: source.label, requestedAt: now });
    await ctx.audit({
      action: "inventory.space-requested",
      entityType: "space_booking",
      entityId: input.id,
      after: { spaceId: space.id, sourceId: source.id },
    });
    await notifyApproval(ctx, await seatDeciders("VP_ADMIN", source.termId, ctx.tx), {
      title: tList("T-5201")[2],
      body: space.name,
      url: path + "#" + input.id,
      dedupeKey: "espacio-pedido:" + input.id,
    });
    return input.id;
  });
}

export function decideSpaceAs(actor: Actor, id: string, raw: BoardDecision, now = new Date()) {
  const input = readBoardDecision(raw);
  return runCommand(actor, async (ctx) => {
    const as = await requireApprovalAuthority(ctx, "VP_ADMIN", now);
    const [row] = await ctx.tx
      .select()
      .from(spaceBooking)
      .where(eq(spaceBooking.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") {
      if (
        row.status === input.decision &&
        row.decidedById === actor.personId &&
        row.decisionNote === input.note
      )
        return;
      throw new DomainError(t("T-5169"));
    }
    // Todas las decisiones del mismo espacio comparten este bloqueo, incluso si las piden direcciones distintas.
    const [space] = await ctx.tx
      .select()
      .from(inventorySpace)
      .where(eq(inventorySpace.id, row.spaceId))
      .for("update");
    if (!space) throw new DomainError(t("T-5200"));
    if (input.decision === "APPROVED") {
      if (!space.active || row.endsAt <= now) throw new DomainError(t("T-5200"));
      const [busy] = await ctx.tx
        .select({ id: spaceBooking.id })
        .from(spaceBooking)
        .where(
          and(
            eq(spaceBooking.spaceId, row.spaceId),
            eq(spaceBooking.status, "APPROVED"),
            lt(spaceBooking.startsAt, row.endsAt),
            gt(spaceBooking.endsAt, row.startsAt),
          ),
        )
        .limit(1);
      if (busy) throw new DomainError(t("T-5199"));
    }
    await ctx.tx
      .update(spaceBooking)
      .set({
        status: input.decision,
        decidedById: actor.personId,
        decidedAt: now,
        decidedAs: as,
        decisionNote: input.note,
      })
      .where(eq(spaceBooking.id, id));
    await ctx.audit({
      action: "inventory.space-decided",
      entityType: "space_booking",
      entityId: id,
      after: { ...input, as },
    });
    await notifyApproval(ctx, [row.requesterId], {
      title: tList("T-5201")[3],
      body: space.name,
      url: path + "#" + id,
      dedupeKey: "espacio-decidido:" + id,
    });
  });
}

export async function spaceBookingsFor(personId: string, pendingOnly = false) {
  const manager = await currentInventoryManagerRole(personId);
  const rows = await getDb()
    .select({ booking: spaceBooking, name: inventorySpace.name })
    .from(spaceBooking)
    .innerJoin(inventorySpace, eq(spaceBooking.spaceId, inventorySpace.id))
    .where(
      and(
        manager ? undefined : eq(spaceBooking.requesterId, personId),
        pendingOnly ? eq(spaceBooking.status, "PENDING") : undefined,
      ),
    )
    .orderBy(desc(spaceBooking.requestedAt));
  const people = await getPeopleByIds([
    ...new Set(
      rows.flatMap(({ booking: r }) =>
        r.decidedById ? [r.requesterId, r.decidedById] : [r.requesterId],
      ),
    ),
  ]);
  return rows.map(({ booking: r, name }) => ({
    ...r,
    name,
    requesterName: people.get(r.requesterId)?.fullName,
    decidedByName: people.get(r.decidedById ?? "")?.fullName,
  }));
}

export async function spaceCatalogFor(personId: string, from: Date, to: Date) {
  const [manager, sources] = await Promise.all([
    currentInventoryManagerRole(personId),
    listLogisticsSources(personId),
  ]);
  const spaces =
    manager || sources.length
      ? await getDb()
          .select()
          .from(inventorySpace)
          .where(manager ? undefined : eq(inventorySpace.active, 1))
          .orderBy(asc(inventorySpace.name))
      : [];
  const booked =
    manager || sources.length
      ? await getDb()
          .select({
            id: spaceBooking.id,
            name: inventorySpace.name,
            startsAt: spaceBooking.startsAt,
            endsAt: spaceBooking.endsAt,
          })
          .from(spaceBooking)
          .innerJoin(inventorySpace, eq(spaceBooking.spaceId, inventorySpace.id))
          .where(
            and(
              eq(spaceBooking.status, "APPROVED"),
              lt(spaceBooking.startsAt, to),
              gt(spaceBooking.endsAt, from),
            ),
          )
          .orderBy(asc(spaceBooking.startsAt), asc(inventorySpace.name))
      : [];
  return { manager, sources, spaces, booked };
}
