import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { approvedEventForCommittee } from "@/modules/finance";
import {
  type BoardDecision,
  getPeopleByIds,
  notifyApproval,
  readBoardDecision,
  requireApprovalAuthority,
  resolveLogisticsSource,
  seatDeciders,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { APP_TIME_ZONE, addDays, atHourIn, dateKeyIn } from "@/shared/lib/dates-pure";
import { DomainError } from "@/shared/lib/errors";
import {
  inventoryItem,
  inventoryLoanApproval,
  inventoryReservation,
  inventoryReservationLine,
} from "../schema";
import { hasReservationGrant, lockActors } from "./access";
import { INVENTORY_SOURCE_KINDS } from "./types";

const lineSchema = z.object({
  itemId: z.string().min(1).max(160),
  quantity: z.number().int().positive().max(10000),
});
const requestSchema = z.object({
  id: z.cuid2(),
  sourceKind: z.enum(INVENTORY_SOURCE_KINDS),
  sourceId: z.string().min(1).max(160),
  purpose: z.enum(["COMMITTEE_EVENT", "MACROEVENT", "OTHER", "EXCEPTION"]),
  eventApprovalId: z.string().max(160).default(""),
  title: z.string().trim().min(2).max(180),
  eventStartsOn: z.iso.date(),
  eventEndsOn: z.iso.date(),
  startsAt: z.iso.datetime({ offset: true }),
  returnAt: z.iso.datetime({ offset: true }).optional(),
  minutes: z.string().trim().min(3).max(6000),
  supportingRecord: z.string().trim().max(2000).default(""),
  lateReason: z.string().trim().max(2000).default(""),
  lines: z.array(lineSchema).min(1).max(100),
});
type LoanRequest = z.input<typeof requestSchema>;
type RequestLine = z.infer<typeof lineSchema>;
function orderedLines(lines: RequestLine[]) {
  return [...lines].sort((a, b) => a.itemId.localeCompare(b.itemId));
}

export function requestLoanApprovalAs(actor: Actor, raw: LoanRequest, now = new Date()) {
  const input = requestSchema.parse(raw);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...input, lines: orderedLines(input.lines) }))
    .digest("hex");
  return runCommand(actor, async (ctx) => {
    const personId = await lockActors(ctx.tx, actor);
    const [prior] = await ctx.tx
      .select()
      .from(inventoryLoanApproval)
      .where(eq(inventoryLoanApproval.id, input.id));
    if (prior) {
      if (prior.requesterId !== personId || prior.fingerprint !== fingerprint)
        throw new DomainError(t("T-5169"));
      return { id: prior.id, startsAt: prior.startsAt, endsAt: prior.endsAt };
    }
    const source = await resolveLogisticsSource(
      { kind: input.sourceKind, id: input.sourceId },
      ctx.tx,
      now,
    );
    if (
      !source?.live ||
      source.personId !== personId ||
      !(await hasReservationGrant(personId, source.kind, source.id, ctx.tx))
    )
      throw new DomainError(t("T-4206"));
    const ordinary = input.purpose === "COMMITTEE_EVENT";
    const event =
      ordinary && source.committeeId
        ? await approvedEventForCommittee(input.eventApprovalId, source.committeeId, ctx.tx)
        : null;
    if (
      (ordinary && !event) ||
      (!ordinary && (input.eventApprovalId || input.supportingRecord.length < 3)) ||
      (input.purpose === "MACROEVENT" && !source.editionId) ||
      (input.purpose === "EXCEPTION" && !source.committeeId) ||
      (source.editionId && input.purpose !== "MACROEVENT" && input.purpose !== "OTHER")
    )
      throw new DomainError(t("T-5190"));
    const eventStartsOn = event?.eventOn ?? input.eventStartsOn;
    const isEvent = input.purpose !== "OTHER";
    const startsAt = new Date(input.startsAt);
    // El intervalo es semiabierto. La devolución puede hacerse durante todo el quinto día en Colombia.
    const endsAt = isEvent
      ? atHourIn(APP_TIME_ZONE, addDays(input.eventEndsOn, 6), 0)
      : input.returnAt
        ? new Date(input.returnAt)
        : null;
    if (
      !endsAt ||
      startsAt >= endsAt ||
      endsAt <= now ||
      startsAt <= now ||
      eventStartsOn > input.eventEndsOn ||
      (ordinary && input.eventStartsOn !== eventStartsOn) ||
      (isEvent && dateKeyIn(APP_TIME_ZONE, startsAt) > input.eventEndsOn)
    )
      throw new DomainError(t("T-5190"));
    if (
      isEvent &&
      dateKeyIn(APP_TIME_ZONE, now) > addDays(eventStartsOn, -15) &&
      input.lateReason.length < 3
    )
      throw new DomainError(t("T-5191"));
    const items = await ctx.tx
      .select({ id: inventoryItem.id, name: inventoryItem.name })
      .from(inventoryItem)
      .where(
        and(
          inArray(
            inventoryItem.id,
            input.lines.map((line) => line.itemId),
          ),
          eq(inventoryItem.active, 1),
        ),
      );
    if (items.length !== input.lines.length) throw new DomainError(t("T-4202"));
    const lines = input.lines.map((line) => ({
      ...line,
      name: items.find((item) => item.id === line.itemId)?.name ?? "",
    }));
    await ctx.tx.insert(inventoryLoanApproval).values({
      id: input.id,
      requesterId: personId,
      sourceId: source.id,
      sourceKind: source.kind,
      scopeLabel: source.label,
      committeeId: source.committeeId,
      editionId: source.editionId,
      purpose: input.purpose,
      eventApprovalId: event?.id ?? null,
      title: event?.title ?? input.title,
      eventStartsOn,
      eventEndsOn: input.eventEndsOn,
      startsAt,
      endsAt,
      minutes: input.minutes,
      supportingRecord: input.supportingRecord,
      lateReason: input.lateReason,
      lines,
      fingerprint,
      requestedAt: now,
    });
    await ctx.audit({
      action: "inventory.approval-requested",
      entityType: "inventory_loan_approval",
      entityId: input.id,
      after: { sourceId: source.id, eventApprovalId: event?.id, lines },
    });
    const term = await getCurrentTerm(now, ctx.tx);
    if (term)
      await notifyApproval(ctx, await seatDeciders("VP_ADMIN", term.id, ctx.tx), {
        title: tList("T-5193")[0],
        body: event?.title ?? input.title,
        url: `/admin/inventario/prestamos#${input.id}`,
        dedupeKey: `materiales-pedidos:${input.id}`,
      });
    return { id: input.id, startsAt, endsAt };
  });
}

export function decideLoanApprovalAs(
  actor: Actor,
  id: string,
  raw: BoardDecision,
  now = new Date(),
) {
  const input = readBoardDecision(raw);
  return runCommand(actor, async (ctx) => {
    const as = await requireApprovalAuthority(ctx, "VP_ADMIN", now);
    const [row] = await ctx.tx
      .select()
      .from(inventoryLoanApproval)
      .where(eq(inventoryLoanApproval.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") {
      if (
        row.status === input.decision &&
        row.decidedById === actor.personId &&
        row.decisionNote === input.note
      )
        return;
      throw new DomainError(t("T-2296"));
    }
    const decision = {
      status: input.decision,
      decisionNote: input.note,
      decidedAt: now,
      decidedById: actor.personId,
      decidedAs: as,
    };
    await ctx.tx
      .update(inventoryLoanApproval)
      .set(decision)
      .where(eq(inventoryLoanApproval.id, id));
    await ctx.audit({
      action: "inventory.approval-decided",
      entityType: "inventory_loan_approval",
      entityId: id,
      after: decision,
    });
    await notifyApproval(ctx, [row.requesterId], {
      title: tList("T-5193")[1],
      body: row.title,
      url: `/app/inventario#${id}`,
      dedupeKey: `materiales-decididos:${id}`,
    });
  });
}

export async function listLoanApprovals(
  filter: { requesterId: string } | { pendingOnly: boolean },
) {
  const rows = await getDb()
    .select()
    .from(inventoryLoanApproval)
    .where(
      "requesterId" in filter
        ? eq(inventoryLoanApproval.requesterId, filter.requesterId)
        : filter.pendingOnly
          ? eq(inventoryLoanApproval.status, "PENDING")
          : undefined,
    )
    .orderBy(desc(inventoryLoanApproval.requestedAt));
  const people = await getPeopleByIds([
    ...new Set(
      rows
        .flatMap((row) => [row.requesterId, row.decidedById])
        .filter((id): id is string => id !== null),
    ),
  ]);
  return rows.map((row) => ({
    ...row,
    requesterName: people.get(row.requesterId)?.fullName,
    decidedByName: people.get(row.decidedById ?? "")?.fullName,
  }));
}

async function consumedQuantities(approvalId: string, exec: Executor) {
  const used = await exec
    .select({
      itemId: inventoryReservationLine.itemId,
      quantity: sql<number>`sum(${inventoryReservationLine.quantity})`.mapWith(Number),
    })
    .from(inventoryReservationLine)
    .innerJoin(
      inventoryReservation,
      eq(inventoryReservation.id, inventoryReservationLine.reservationId),
    )
    .where(
      and(
        eq(inventoryReservation.approvalId, approvalId),
        ne(inventoryReservation.status, "CANCELLED"),
      ),
    )
    .groupBy(inventoryReservationLine.itemId);
  return new Map(used.map((line) => [line.itemId, line.quantity]));
}

// La decisión cubre esta lista. La fila serializa el consumo entre confirmaciones, aunque el carrito tenga artículos diferentes.
export async function checkLoanAllowance(
  ctx: CommandContext,
  input: {
    approvalId: string;
    requestKey: string;
    sourceKind: string;
    sourceId: string;
    startsAt: string;
    endsAt: string;
    lines: RequestLine[];
    collectorId?: string | undefined;
  },
  now: Date,
) {
  const [approval] = await ctx.tx
    .select()
    .from(inventoryLoanApproval)
    .where(eq(inventoryLoanApproval.id, input.approvalId))
    .for("update");
  if (
    !approval ||
    approval.requesterId !== ctx.actor.personId ||
    approval.status !== "APPROVED" ||
    approval.sourceKind !== input.sourceKind ||
    approval.sourceId !== input.sourceId ||
    approval.startsAt.getTime() !== Date.parse(input.startsAt) ||
    approval.endsAt.getTime() !== Date.parse(input.endsAt)
  )
    throw new DomainError(t("T-5192"));
  const [prior] = await ctx.tx
    .select()
    .from(inventoryReservation)
    .where(
      and(
        eq(inventoryReservation.approvalId, approval.id),
        eq(inventoryReservation.requestKey, input.requestKey),
      ),
    );
  if (prior) {
    const lines = await ctx.tx
      .select({
        itemId: inventoryReservationLine.itemId,
        quantity: inventoryReservationLine.quantity,
      })
      .from(inventoryReservationLine)
      .where(eq(inventoryReservationLine.reservationId, prior.id));
    if (
      prior.collectorId !== (input.collectorId ?? ctx.actor.personId) ||
      JSON.stringify(orderedLines(input.lines)) !== JSON.stringify(orderedLines(lines))
    )
      throw new DomainError(t("T-5169"));
    return prior.id;
  }
  if (
    approval.purpose !== "OTHER" &&
    dateKeyIn(APP_TIME_ZONE, now) < addDays(approval.eventStartsOn, -15)
  )
    throw new DomainError(tList("T-5193")[2]);
  const used = await consumedQuantities(approval.id, ctx.tx);
  for (const requested of input.lines) {
    const limit = approval.lines.find((line) => line.itemId === requested.itemId)?.quantity ?? 0;
    if (requested.quantity > limit - (used.get(requested.itemId) ?? 0))
      throw new DomainError(t("T-5192"));
  }
  return null;
}

export async function remainingLoanLines(approval: typeof inventoryLoanApproval.$inferSelect) {
  const used = await consumedQuantities(approval.id, getDb());
  return approval.lines.map((line) => ({
    ...line,
    remaining: line.quantity - (used.get(line.itemId) ?? 0),
  }));
}
