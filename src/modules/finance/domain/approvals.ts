import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { assertBenefitsAvailable, listCommitteesByIds } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { scopeId } from "@/shared/lib/scope-id";
import { committeeBudget, eventApproval } from "../schema";
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
  const term = await getCurrentTerm();
  if (ctx.actor.personId && term) {
    await assertBenefitsAvailable(ctx.tx, ctx.actor.personId, term.id);
  }
  if (input.budgetId) {
    const [budget] = await ctx.tx
      .select()
      .from(committeeBudget)
      .where(eq(committeeBudget.id, input.budgetId));
    if (!budget || budget.committeeId !== input.committeeId) {
      throw new DomainError(t("T-2294"), "budgetId");
    }
    if (Number(input.eventOn.slice(0, 4)) !== budget.year) {
      throw new DomainError(t("T-2329", { año: budget.year }), "eventOn");
    }
  }
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

/** Desde dónde se decide un aval: la página del presupuesto que lo muestra (ADR-122 regla 1). */
export interface ApprovalScope {
  budgetId: string;
}

/**
 * La Presidencia decide una sola vez; una decisión distinta exige un aval nuevo. El alcance es
 * obligatorio (ADR-122 regla 1): la página de un presupuesto muestra los avales de su comité, así que
 * sin presupuesto, con uno que no existe o con el de otro comité, el aval responde como uno que no
 * existe.
 */
export async function decideEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalDecisionInput,
  scope: ApprovalScope,
  now = new Date(),
): Promise<void> {
  const input = approvalDecisionSchema.parse(raw);
  // Falla cerrado: un alcance que no trae presupuesto no decide nada.
  const budgetId = scopeId(scope, "budgetId");
  if (budgetId === null) {
    throw new DomainError(t("T-032"));
  }
  // Lectura sin candado: solo dice de qué comité es la página.
  const [pageBudget] = await ctx.tx
    .select({ committeeId: committeeBudget.committeeId })
    .from(committeeBudget)
    .where(eq(committeeBudget.id, budgetId));
  const [row] = await ctx.tx
    .select()
    .from(eventApproval)
    .where(eq(eventApproval.id, id))
    .for("update");
  if (!row || !pageBudget || row.committeeId !== pageBudget.committeeId) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "PENDING") {
    throw new DomainError(t("T-2296"));
  }
  if (input.decision === "APPROVED" && row.eventOn <= todayKey(now)) {
    throw new DomainError(t("T-2330"));
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
  return tLabels("T-2300", APPROVAL_STATUSES)[status] ?? status;
}
