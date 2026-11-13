import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import {
  APPOINTMENT_KINDS,
  assertNotSuspended,
  currentSeatAuthority,
  listCommitteesByIds,
  seatDeciders,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { committeeBudget, eventApproval } from "../schema";
import { APPROVAL_STATUSES } from "./budget-pure";

// Aval de evento (Regl. art. 36 par. 1; Est. art. 23.11 y 36.3; ADR-060 regla 12): el comité lo pide
// con la fecha del evento y la Presidencia lo aprueba o lo rechaza antes de ejecutar, difundir o
// comprar. Los gastos y traslados del evento se ligan al aval aprobado. Desde ADR-195 lo decide la
// Presidencia por su cargo, no quien tenga ADMIN, y a ella le llega el aviso.

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

const civilDate = (day: string) => formatDate(new Date(`${day}T12:00:00Z`));

export async function requestEventApproval(
  ctx: CommandContext,
  raw: ApprovalRequestInput,
): Promise<{ id: string }> {
  const input = approvalRequestSchema.parse(raw);
  const term = await getCurrentTerm();
  // La prueba no impide pedirlo; una suspensión vigente sí (ADR-195 regla 5).
  if (ctx.actor.personId) {
    await assertNotSuspended(ctx.tx, ctx.actor.personId);
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
  // El aviso a quien decide (ADR-195 regla 3). Sin Presidencia activa nadie lo recibe y el aval espera.
  const deciders = term ? await seatDeciders("PRESIDENT", term.id, ctx.tx) : [];
  if (deciders.length > 0) {
    const [committee] = await listCommitteesByIds([input.committeeId]);
    const [title, body] = tList("T-5090");
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients: deciders.map((personId) => ({ personId })),
        title: title ?? "",
        body: (body ?? "")
          .replace("{comité}", committee?.name ?? "")
          .replace("{evento}", input.title)
          .replace("{fecha}", civilDate(input.eventOn)),
        url: `/admin/avales?aval=${row.id}`,
        tag: `aval-${row.id}`,
        dedupeKey: `aval-evento:${row.id}`,
      }),
    );
  }
  return row;
}

/**
 * La Presidencia decide, por su cargo y una sola vez; una decisión distinta exige un aval nuevo
 * (ADR-195 reglas 1 y 2). Decide los avales de todos los comités, así que no hay alcance de página: el
 * alcance es el cargo, que se comprueba aquí dentro (ADR-072). Rechazar exige el motivo, que el comité
 * lee en el aviso y en su sección de finanzas.
 */
export async function decideEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalDecisionInput,
  now = new Date(),
): Promise<void> {
  const input = approvalDecisionSchema.parse(raw);
  const authority = ctx.actor.personId
    ? await currentSeatAuthority(ctx.actor.personId, "PRESIDENT", ctx.tx, now)
    : null;
  if (authority !== "HOLDER") {
    throw new DomainError(t("T-5088", { cargo: tLabels("T-444", APPOINTMENT_KINDS).PRESIDENT }));
  }
  if (input.decision === "REJECTED" && input.note.length < 2) {
    throw new DomainError(t("T-5087"), "note");
  }
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
  // El aviso a quien lo pidió, con el motivo si se rechazó (ADR-195 regla 3).
  if (row.requestedById) {
    const [committee] = await listCommitteesByIds([row.committeeId]);
    const [title, approved, rejected] = tList("T-5091");
    const body = input.decision === "APPROVED" ? approved : rejected;
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients: [{ personId: row.requestedById }],
        title: title ?? "",
        body: (body ?? "").replace("{evento}", row.title).replace("{motivo}", input.note),
        url: committee ? `/admin/comites/${committee.slug}?area=finanzas` : "/admin",
        tag: `aval-${row.id}`,
        dedupeKey: `aval-evento-decidido:${row.id}`,
      }),
    );
  }
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
