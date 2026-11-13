import { and, asc, desc, eq } from "drizzle-orm";
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
import { committeeBudget, eventApproval, eventApprovalEntry } from "../schema";
import { APPROVAL_STATUSES, RISK_LEVELS, type RiskLevel } from "./budget-pure";

// Aval de evento (Regl. art. 36 par. 1; Est. art. 23.11 y 36.3; ADR-060 regla 12): el comité lo pide
// con la fecha del evento y la Presidencia lo aprueba o lo rechaza antes de ejecutar, difundir o
// comprar. Los gastos y traslados del evento se ligan al aval aprobado. Desde ADR-195 lo decide la
// Presidencia por su cargo, no quien tenga ADMIN, y a ella le llega el aviso.
//
// Ida y vuelta (ADR-197 reglas 1 y 2): el comité declara el semáforo de riesgo y lo justifica; la
// Presidencia puede devolverlo con comentarios, sin decidir, y el comité lo corrige y envía una versión
// nueva; la Presidencia también puede cambiar el semáforo. Cada paso queda en la historia del aval.

export type EventApprovalRow = typeof eventApproval.$inferSelect;
export type EventApprovalEntryRow = typeof eventApprovalEntry.$inferSelect;

const versionFields = {
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  eventOn: z.iso.date(),
  riskLevel: z.enum(RISK_LEVELS),
  riskJustification: z.string().trim().max(1000).default(""),
};

export const approvalRequestSchema = z.object({
  committeeId: z.string().trim().min(1),
  budgetId: z.string().trim().min(1).optional(),
  editionId: z.string().trim().min(1).optional(),
  ...versionFields,
});

export type ApprovalRequestInput = z.input<typeof approvalRequestSchema>;

/** Lo que el comité corrige al enviar una versión nueva de un aval devuelto. */
export const approvalVersionSchema = z.object(versionFields);

export type ApprovalVersionInput = z.input<typeof approvalVersionSchema>;

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).default(""),
});

export type ApprovalDecisionInput = z.input<typeof approvalDecisionSchema>;

export const approvalReturnSchema = z.object({
  note: z.string().trim().max(1000).default(""),
});

export type ApprovalReturnInput = z.input<typeof approvalReturnSchema>;

export const approvalRiskSchema = z.object({
  riskLevel: z.enum(RISK_LEVELS),
  note: z.string().trim().max(500).default(""),
});

export type ApprovalRiskInput = z.input<typeof approvalRiskSchema>;

/** El comité de la página desde la que se reenvía (ADR-122 regla 1). */
export interface ApprovalScope {
  committeeId: string;
}

export interface EventApprovalListRow extends EventApprovalRow {
  committeeName: string;
  committeeSlug: string;
}

export interface EventApprovalDetail extends EventApprovalListRow {
  /** De la más vieja a la más nueva. */
  entries: EventApprovalEntryRow[];
}

const civilDate = (day: string) => formatDate(new Date(`${day}T12:00:00Z`));
const guard = (index: number) => tList("T-5113")[index] ?? "";

export function riskLevelLabel(level: RiskLevel): string {
  return tLabels("T-5102", RISK_LEVELS)[level] ?? level;
}

/** El comité declara por qué ese nivel (ADR-197 regla 2). */
function assertJustified(input: { riskJustification: string }) {
  if (input.riskJustification.length < 2) {
    throw new DomainError(guard(6), "riskJustification");
  }
}

async function assertBudgetFits(
  ctx: CommandContext,
  committeeId: string,
  budgetId: string | null,
  eventOn: string,
) {
  if (!budgetId) return;
  const [budget] = await ctx.tx
    .select()
    .from(committeeBudget)
    .where(eq(committeeBudget.id, budgetId));
  if (!budget || budget.committeeId !== committeeId) {
    throw new DomainError(t("T-2294"), "budgetId");
  }
  if (Number(eventOn.slice(0, 4)) !== budget.year) {
    throw new DomainError(t("T-2329", { año: budget.year }), "eventOn");
  }
}

/** Solo la Presidencia titular decide, devuelve y cambia el semáforo (ADR-195 regla 2). */
async function assertPresidency(ctx: CommandContext, now: Date) {
  const authority = ctx.actor.personId
    ? await currentSeatAuthority(ctx.actor.personId, "PRESIDENT", ctx.tx, now)
    : null;
  if (authority !== "HOLDER") {
    throw new DomainError(t("T-5088", { cargo: tLabels("T-444", APPOINTMENT_KINDS).PRESIDENT }));
  }
}

async function lockApproval(ctx: CommandContext, id: string): Promise<EventApprovalRow> {
  const [row] = await ctx.tx
    .select()
    .from(eventApproval)
    .where(eq(eventApproval.id, id))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/** Quien lo pidió y quien envió la última versión: a ellos les llegan los avisos del comité. */
async function committeeRecipients(ctx: CommandContext, row: EventApprovalRow) {
  const [last] = await ctx.tx
    .select({ authorId: eventApprovalEntry.authorId })
    .from(eventApprovalEntry)
    .where(and(eq(eventApprovalEntry.approvalId, row.id), eq(eventApprovalEntry.kind, "SUBMITTED")))
    .orderBy(desc(eventApprovalEntry.version))
    .limit(1);
  const ids = new Set<string>();
  if (row.requestedById) ids.add(row.requestedById);
  if (last?.authorId) ids.add(last.authorId);
  return [...ids].map((personId) => ({ personId }));
}

async function committeeUrl(committeeId: string) {
  const [committee] = await listCommitteesByIds([committeeId]);
  return {
    committee,
    url: committee ? `/admin/comites/${committee.slug}?area=finanzas` : "/admin",
  };
}

/** El aviso a la Presidencia de que hay algo que revisar (ADR-195 regla 3). */
async function notifyPresidency(
  ctx: CommandContext,
  row: { id: string; committeeId: string; title: string; eventOn: string; version: number },
) {
  const term = await getCurrentTerm();
  // Sin Presidencia activa nadie lo recibe y el aval espera.
  const deciders = term ? await seatDeciders("PRESIDENT", term.id, ctx.tx) : [];
  if (deciders.length === 0) return;
  const [committee] = await listCommitteesByIds([row.committeeId]);
  const [title, body] = tList(row.version === 1 ? "T-5090" : "T-5111");
  await ctx.emit(
    eventOf(notificationRequested, {
      kind: "TRANSACTIONAL",
      recipients: deciders.map((personId) => ({ personId })),
      title: title ?? "",
      body: (body ?? "")
        .replace("{comité}", committee?.name ?? "")
        .replace("{evento}", row.title)
        .replace("{fecha}", civilDate(row.eventOn))
        .replace("{versión}", String(row.version)),
      url: `/admin/avales?aval=${row.id}`,
      tag: `aval-${row.id}`,
      dedupeKey:
        row.version === 1 ? `aval-evento:${row.id}` : `aval-evento:${row.id}:v${row.version}`,
    }),
  );
}

export async function requestEventApproval(
  ctx: CommandContext,
  raw: ApprovalRequestInput,
): Promise<{ id: string }> {
  const input = approvalRequestSchema.parse(raw);
  assertJustified(input);
  // La prueba no impide pedirlo; una suspensión vigente sí (ADR-195 regla 5).
  if (ctx.actor.personId) {
    await assertNotSuspended(ctx.tx, ctx.actor.personId);
  }
  await assertBudgetFits(ctx, input.committeeId, input.budgetId ?? null, input.eventOn);
  const values = {
    committeeId: input.committeeId,
    budgetId: input.budgetId ?? null,
    editionId: input.editionId ?? null,
    title: input.title,
    description: input.description,
    eventOn: input.eventOn,
    riskLevel: input.riskLevel,
    riskJustification: input.riskJustification,
    requestedById: ctx.actor.personId,
  };
  const [row] = await ctx.tx
    .insert(eventApproval)
    .values(values)
    .returning({ id: eventApproval.id });
  if (!row) {
    throw new Error("No se pudo pedir el aval");
  }
  await ctx.tx.insert(eventApprovalEntry).values({
    approvalId: row.id,
    version: 1,
    kind: "SUBMITTED",
    title: input.title,
    description: input.description,
    eventOn: input.eventOn,
    riskLevel: input.riskLevel,
    riskJustification: input.riskJustification,
    authorId: ctx.actor.personId,
  });
  await ctx.audit({
    action: "event-approval.requested",
    entityType: "event_approval",
    entityId: row.id,
    after: values,
  });
  await notifyPresidency(ctx, { ...values, id: row.id, version: 1 });
  return row;
}

/**
 * La Presidencia devuelve un aval pendiente con comentarios (ADR-197 regla 1). Devolver no decide: el
 * aval queda abierto hasta que el comité envíe la versión nueva.
 */
export async function returnEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalReturnInput,
  now = new Date(),
): Promise<void> {
  const input = approvalReturnSchema.parse(raw);
  await assertPresidency(ctx, now);
  if (input.note.length < 2) {
    throw new DomainError(guard(2), "note");
  }
  const row = await lockApproval(ctx, id);
  if (row.status === "RETURNED") {
    throw new DomainError(guard(0));
  }
  if (row.status !== "PENDING") {
    throw new DomainError(t("T-2296"));
  }
  await ctx.tx.update(eventApproval).set({ status: "RETURNED" }).where(eq(eventApproval.id, id));
  await ctx.tx.insert(eventApprovalEntry).values({
    approvalId: id,
    version: row.version,
    kind: "RETURNED",
    note: input.note,
    authorId: ctx.actor.personId,
  });
  await ctx.audit({
    action: "event-approval.returned",
    entityType: "event_approval",
    entityId: id,
    before: { status: row.status, version: row.version },
    after: { status: "RETURNED", note: input.note },
  });
  const recipients = await committeeRecipients(ctx, row);
  if (recipients.length > 0) {
    const { url } = await committeeUrl(row.committeeId);
    const [title, body] = tList("T-5110");
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients,
        title: title ?? "",
        body: (body ?? "").replace("{evento}", row.title).replace("{comentarios}", input.note),
        url,
        tag: `aval-${id}`,
        dedupeKey: `aval-evento-devuelto:${id}:v${row.version}`,
      }),
    );
  }
}

/** El comité corrige un aval devuelto y lo envía otra vez como una versión nueva (ADR-197 regla 1). */
export async function resubmitEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalVersionInput,
  scope: ApprovalScope,
): Promise<void> {
  const input = approvalVersionSchema.parse(raw);
  assertJustified(input);
  if (ctx.actor.personId) {
    await assertNotSuspended(ctx.tx, ctx.actor.personId);
  }
  const row = await lockApproval(ctx, id);
  if (row.committeeId !== scope.committeeId) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "RETURNED") {
    throw new DomainError(guard(1));
  }
  await assertBudgetFits(ctx, row.committeeId, row.budgetId, input.eventOn);
  const version = row.version + 1;
  const values = {
    status: "PENDING" as const,
    version,
    title: input.title,
    description: input.description,
    eventOn: input.eventOn,
    riskLevel: input.riskLevel,
    riskJustification: input.riskJustification,
  };
  await ctx.tx.update(eventApproval).set(values).where(eq(eventApproval.id, id));
  await ctx.tx.insert(eventApprovalEntry).values({
    approvalId: id,
    version,
    kind: "SUBMITTED",
    title: input.title,
    description: input.description,
    eventOn: input.eventOn,
    riskLevel: input.riskLevel,
    riskJustification: input.riskJustification,
    authorId: ctx.actor.personId,
  });
  await ctx.audit({
    action: "event-approval.resubmitted",
    entityType: "event_approval",
    entityId: id,
    before: {
      version: row.version,
      title: row.title,
      description: row.description,
      eventOn: row.eventOn,
      riskLevel: row.riskLevel,
      riskJustification: row.riskJustification,
    },
    after: values,
  });
  await notifyPresidency(ctx, { ...values, id, committeeId: row.committeeId });
}

/**
 * La Presidencia cambia el semáforo y dice por qué (ADR-197 regla 2). Vale mientras el aval está abierto
 * y también aprobado, porque acompaña la ejecución; un aval rechazado ya no cambia.
 */
export async function changeEventApprovalRisk(
  ctx: CommandContext,
  id: string,
  raw: ApprovalRiskInput,
  now = new Date(),
): Promise<void> {
  const input = approvalRiskSchema.parse(raw);
  await assertPresidency(ctx, now);
  if (input.note.length < 2) {
    throw new DomainError(guard(3), "note");
  }
  const row = await lockApproval(ctx, id);
  if (row.status === "REJECTED") {
    throw new DomainError(guard(4));
  }
  if (row.riskLevel === input.riskLevel) {
    throw new DomainError(guard(5), "riskLevel");
  }
  await ctx.tx
    .update(eventApproval)
    .set({ riskLevel: input.riskLevel })
    .where(eq(eventApproval.id, id));
  await ctx.tx.insert(eventApprovalEntry).values({
    approvalId: id,
    version: row.version,
    kind: "RISK_CHANGED",
    riskLevel: input.riskLevel,
    note: input.note,
    authorId: ctx.actor.personId,
  });
  await ctx.audit({
    action: "event-approval.risk-changed",
    entityType: "event_approval",
    entityId: id,
    before: { riskLevel: row.riskLevel },
    after: { riskLevel: input.riskLevel, note: input.note },
  });
  const recipients = await committeeRecipients(ctx, row);
  if (recipients.length > 0) {
    const { url } = await committeeUrl(row.committeeId);
    const [title, body] = tList("T-5112");
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients,
        title: title ?? "",
        body: (body ?? "")
          .replace("{nivel}", riskLevelLabel(input.riskLevel).toLowerCase())
          .replace("{evento}", row.title)
          .replace("{motivo}", input.note),
        url,
        tag: `aval-${id}`,
        dedupeKey: `aval-evento-semaforo:${id}:${now.getTime()}`,
      }),
    );
  }
}

/**
 * La Presidencia decide, por su cargo y una sola vez; una decisión distinta exige un aval nuevo
 * (ADR-195 reglas 1 y 2). Decide los avales de todos los comités, así que no hay alcance de página: el
 * alcance es el cargo, que se comprueba aquí dentro (ADR-072). Rechazar exige el motivo, que el comité
 * lee en el aviso y en su sección de finanzas. Un aval devuelto espera la versión nueva (ADR-197).
 */
export async function decideEventApproval(
  ctx: CommandContext,
  id: string,
  raw: ApprovalDecisionInput,
  now = new Date(),
): Promise<void> {
  const input = approvalDecisionSchema.parse(raw);
  await assertPresidency(ctx, now);
  if (input.decision === "REJECTED" && input.note.length < 2) {
    throw new DomainError(t("T-5087"), "note");
  }
  const row = await lockApproval(ctx, id);
  if (row.status === "RETURNED") {
    throw new DomainError(guard(0));
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
  const recipients = await committeeRecipients(ctx, row);
  if (recipients.length > 0) {
    const { url } = await committeeUrl(row.committeeId);
    const [title, approved, rejected] = tList("T-5091");
    const body = input.decision === "APPROVED" ? approved : rejected;
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients,
        title: title ?? "",
        body: (body ?? "").replace("{evento}", row.title).replace("{motivo}", input.note),
        url,
        tag: `aval-${row.id}`,
        dedupeKey: `aval-evento-decidido:${row.id}`,
      }),
    );
  }
}

async function withCommittees(rows: EventApprovalRow[]): Promise<EventApprovalListRow[]> {
  const refs = await listCommitteesByIds([...new Set(rows.map((row) => row.committeeId))]);
  const byId = new Map(refs.map((ref) => [ref.id, ref]));
  return rows.map((row) => ({
    ...row,
    committeeName: byId.get(row.committeeId)?.name ?? "",
    committeeSlug: byId.get(row.committeeId)?.slug ?? "",
  }));
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
  return withCommittees(rows);
}

/** Un aval con su historia, para su ficha y para imprimirlo; null si no existe. */
export async function getEventApprovalDetail(id: string): Promise<EventApprovalDetail | null> {
  const db = getDb();
  const [row] = await db.select().from(eventApproval).where(eq(eventApproval.id, id));
  if (!row) return null;
  const entries = await db
    .select()
    .from(eventApprovalEntry)
    .where(eq(eventApprovalEntry.approvalId, id))
    .orderBy(asc(eventApprovalEntry.createdAt), asc(eventApprovalEntry.version));
  const [listed] = await withCommittees([row]);
  return listed ? { ...listed, entries } : null;
}

export function approvalStatusLabel(status: EventApprovalRow["status"]): string {
  return tLabels("T-2300", APPROVAL_STATUSES)[status] ?? status;
}
