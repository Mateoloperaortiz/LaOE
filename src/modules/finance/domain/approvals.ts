import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { listCommitteesByIds } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { eventApproval } from "../schema";
import { APPROVAL_STATUSES } from "./budget-pure";

// Aval de evento (Regl. art. 35 par. 1; Est. art. 23.11 y 36.3; ADR-060 regla 12): el comité lo pide
// con la fecha del evento y la Presidencia (ADMIN) lo aprueba o rechaza antes de ejecutar, difundir o
// comprar. Los gastos y traslados del evento se ligan al aval aprobado.

export type EventApprovalRow = typeof eventApproval.$inferSelect;

export const approvalRequestSchema = z.object({
  committeeId: z.string().trim().min(1),
  budgetId: z.string().trim().min(1).optional(),
  editionId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  eventOn: z.iso.date(),
});

export type ApprovalRequestInput = z.input<typeof approvalRequestSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).default(""),
});

export type ApprovalDecisionInput = z.input<typeof approvalDecisionSchema>;

export interface EventApprovalListRow extends EventApprovalRow {
  committeeName: string;
  committeeSlug: string;
}

export async function requestEventApproval(
  ctx: CommandContext,
  raw: ApprovalRequestInput,
): Promise<{ id: string }> {
  const input = approvalRequestSchema.parse(raw);
  const values = {
    committeeId: input.committeeId,
    budgetId: input.budgetId ?? null,
    editionId: input.editionId ?? null,
    title: input.title,
    description: input.description,
    eventOn: input.eventOn,
    requestedById: ctx.actor.personId,
  };
  const [row] = await ctx.tx
    .insert(eventApproval)
    .values(values)
    .returning({ id: eventApproval.id });
  if (!row) {
    throw new Error("No se pudo pedir el aval");
  }
  await ctx.audit({
    action: "event-approval.requested",
    entityType: "event_approval",
    entityId: row.id,
    after: values,
  });
  return row;
}

/** La Presidencia decide una sola vez; una decisión distinta exige un aval nuevo. */
export async function decideEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalDecisionInput,
  now = new Date(),
): Promise<void> {
  const input = approvalDecisionSchema.parse(raw);
  const [row] = await ctx.tx
    .select()
    .from(eventApproval)
    .where(eq(eventApproval.id, id))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "PENDING") {
    throw new DomainError(t("T-2296"));
  }
  await ctx.tx
    .update(eventApproval)
    .set({
      status: input.decision,
      decisionNote: input.note,
      decidedById: ctx.actor.personId,
      decidedAt: now,
    })
    .where(eq(eventApproval.id, id));
  await ctx.audit({
    action: "event-approval.decided",
    entityType: "event_approval",
    entityId: id,
    before: { status: row.status },
    after: { status: input.decision, note: input.note },
  });
}

export async function listEventApprovals(params: {
  committeeId?: string | undefined;
  status?: string | undefined;
}): Promise<EventApprovalListRow[]> {
  const conditions = [];
  if (params.committeeId) {
    conditions.push(eq(eventApproval.committeeId, params.committeeId));
  }
  if (params.status && (APPROVAL_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(eventApproval.status, params.status as EventApprovalRow["status"]));
  }
  const rows = await getDb()
    .select()
    .from(eventApproval)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(eventApproval.requestedAt));
  const refs = await listCommitteesByIds([...new Set(rows.map((row) => row.committeeId))]);
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  return rows.map((row) => ({
    ...row,
    committeeName: byId.get(row.committeeId)?.name ?? "",
    committeeSlug: byId.get(row.committeeId)?.slug ?? "",
  }));
}

export function approvalStatusLabel(status: EventApprovalRow["status"]): string {
  return tList("T-2300")[APPROVAL_STATUSES.indexOf(status)] ?? status;
}
