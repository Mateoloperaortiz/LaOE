import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import {
  excuseCheckIn,
  findCheckIn,
  getOccasionsByIds,
  listOccasionsForTerm,
} from "@/modules/participation";
import {
  changeMembershipStatus,
  endMembership,
  getMembershipRef,
  getMyMembership,
  getPeopleByIds,
  getPersonRecord,
  leaveUntilError,
  leaveWindow,
  listCommitteesByIds,
  setCommitteeMemberships,
} from "@/modules/people";
import { requireConfig, requirePrivacyPolicyVersion } from "@/modules/system";
import { ensureNextTerm, getCurrentTerm, type TermRow } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { addBusinessDays, formatDate, todayKey } from "@/shared/lib/dates";
import { request, task } from "../schema";
import {
  EXCUSE_BUSINESS_DAYS,
  EXCUSE_CAUSES,
  type ExcusePayload,
  type LeavePayload,
  REQUEST_KINDS,
  REQUEST_PAYLOAD_SCHEMAS,
  REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
  resultingCommittees,
  type TransferPayload,
} from "./requests-pure";
import { completeTask } from "./tasks";

// Solicitudes del miembro (ADR-031, ADR-037 regla 9): nada cambia hasta que GH aprueba; aprobar
// ejecuta en la misma transacción el comando de `people` que haría a mano; rechazar exige motivo;
// la persona puede retirar una pendiente. Una pendiente por persona y tipo.

export type RequestRecord = typeof request.$inferSelect;

export interface RequestView extends RequestRecord {
  personName: string;
  personEmail: string;
  kindLabel: string;
  statusLabel: string;
  /** Resumen legible del payload (T-1010 a T-1012). */
  detail: string;
  decidedByName: string | null;
}

export function requestKindLabel(kind: RequestKind): string {
  return tList("T-894")[REQUEST_KINDS.indexOf(kind)] ?? kind;
}

export function requestStatusLabel(status: RequestStatus): string {
  return tList("T-876")[REQUEST_STATUSES.indexOf(status)] ?? status;
}

/** Causal del Anexo 1 en el orden de T-2215 (ADR-060 regla 5). */
export function excuseCauseLabel(cause: string): string {
  const index = (EXCUSE_CAUSES as readonly string[]).indexOf(cause);
  return index >= 0 ? (tList("T-2215")[index] ?? cause) : cause;
}

/** Hasta cuándo se presenta la excusa de una ocasión: tres días hábiles después (Anexo 1, par. 1). */
export function excuseDeadline(startsAt: Date): Date {
  return addBusinessDays(startsAt, EXCUSE_BUSINESS_DAYS);
}

async function describe(
  kind: RequestKind,
  payload: Record<string, unknown>,
  occasionId: string | null,
): Promise<string> {
  if (kind === "EXCUSE") {
    const parsed = REQUEST_PAYLOAD_SCHEMAS.EXCUSE.safeParse(payload);
    const title = occasionId ? (await getOccasionsByIds([occasionId])).get(occasionId)?.title : "";
    return t("T-2216", {
      ocasión: title ?? "",
      causal: parsed.success ? excuseCauseLabel(parsed.data.cause) : t("T-1015"),
    });
  }
  if (kind === "LEAVE") {
    const parsed = REQUEST_PAYLOAD_SCHEMAS.LEAVE.safeParse(payload);
    const [conFecha, sinFecha] = tList("T-1010") as [string, string];
    return parsed.success && parsed.data.until
      ? conFecha.replace("{fecha}", formatDate(new Date(`${parsed.data.until}T12:00:00Z`)))
      : sinFecha;
  }
  if (kind === "RESIGNATION") {
    return t("T-1012");
  }
  const parsed = REQUEST_PAYLOAD_SCHEMAS.TRANSFER.safeParse(payload);
  const ids = parsed.success
    ? [...parsed.data.leaveCommitteeIds, ...parsed.data.joinCommitteeIds]
    : [];
  const committees = new Map((await listCommitteesByIds(ids)).map((row) => [row.id, row.name]));
  const names = (list: string[]) =>
    list.map((id) => committees.get(id) ?? id).join(", ") || t("T-1015");
  return t("T-1011", {
    deja: parsed.success ? names(parsed.data.leaveCommitteeIds) : t("T-1015"),
    entra: parsed.success ? names(parsed.data.joinCommitteeIds) : t("T-1015"),
  });
}

async function toViews(rows: RequestRecord[]): Promise<RequestView[]> {
  const people = await getPeopleByIds([
    ...rows.map((row) => row.personId),
    ...rows.flatMap((row) => (row.decidedById ? [row.decidedById] : [])),
  ]);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      personName: people.get(row.personId)?.fullName ?? "",
      personEmail: people.get(row.personId)?.email ?? "",
      kindLabel: requestKindLabel(row.kind),
      statusLabel: requestStatusLabel(row.status),
      detail: await describe(row.kind, row.payload, row.occasionId),
      decidedByName: row.decidedById ? (people.get(row.decidedById)?.fullName ?? null) : null,
    })),
  );
}

export interface RequestListParams {
  status?: string | undefined;
  kind?: string | undefined;
  personId?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listRequests(
  params: RequestListParams,
): Promise<{ rows: RequestView[]; total: number }> {
  const conditions = [];
  if ((REQUEST_STATUSES as readonly string[]).includes(params.status ?? "")) {
    conditions.push(eq(request.status, params.status as RequestStatus));
  }
  if ((REQUEST_KINDS as readonly string[]).includes(params.kind ?? "")) {
    conditions.push(eq(request.kind, params.kind as RequestKind));
  }
  if (params.personId) {
    conditions.push(eq(request.personId, params.personId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(request)
      .where(where)
      .orderBy(desc(request.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(request).where(where),
  ]);
  return { rows: await toViews(rows), total: total?.n ?? 0 };
}

export async function getRequest(id: string): Promise<RequestView | null> {
  const [row] = await getDb().select().from(request).where(eq(request.id, id)).limit(1);
  return row ? ((await toViews([row]))[0] ?? null) : null;
}

export async function getRequestByTask(taskId: string): Promise<RequestView | null> {
  const [row] = await getDb().select().from(request).where(eq(request.taskId, taskId)).limit(1);
  return row ? ((await toViews([row]))[0] ?? null) : null;
}

/** Las solicitudes de una persona, de la más reciente a la más vieja (Mi OE y Persona 360). */
export async function listRequestsByPerson(personId: string): Promise<RequestView[]> {
  const rows = await getDb()
    .select()
    .from(request)
    .where(eq(request.personId, personId))
    .orderBy(desc(request.createdAt));
  return toViews(rows);
}

export async function countPendingRequests(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(request)
    .where(eq(request.status, "PENDING"));
  return row?.n ?? 0;
}

async function committeeLimits(): Promise<{ min: number; max: number }> {
  const [min, max] = await Promise.all([
    requireConfig("committees.min"),
    requireConfig("committees.max"),
  ]);
  return { min, max };
}

/**
 * Desde Mi OE: solo un miembro activo; valida el payload por tipo y, en un cambio de comité, el
 * conjunto resultante; abre la tarea para GH en la misma transacción y emite `request.created`.
 */
export async function createRequestAs(
  actor: Actor & { personId: string },
  kind: RequestKind,
  raw: unknown,
): Promise<{ id: string }> {
  const membership = await getMembershipRef(actor.personId);
  if (!membership || membership.status !== "ACTIVE") {
    throw new DomainError(t("T-892"));
  }
  const parsed = REQUEST_PAYLOAD_SCHEMAS[kind].safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue?.message.startsWith("T-") ? issue.message : "T-880";
    throw new DomainError(t(code as "T-880"), String(issue?.path[0] ?? ""));
  }
  const payload = parsed.data;
  // Licencia (ADR-060 regla 10): el regreso va desde mañana y hasta un año (Est. art. 5.4).
  if (kind === "LEAVE") {
    const today = todayKey();
    const error = leaveUntilError((payload as LeavePayload).until, today);
    if (error) {
      throw new DomainError(
        t(error, { fecha: formatDate(new Date(`${leaveWindow(today).max}T12:00:00Z`)) }),
        "until",
      );
    }
  }
  if (kind === "TRANSFER") {
    const mine = await getMyMembership(actor.personId);
    const change = resultingCommittees(
      mine.committees.map((row) => ({ committeeId: row.committeeId, roleCode: row.roleCode })),
      payload as TransferPayload,
      await committeeLimits(),
    );
    if (change.error) {
      const limits = await committeeLimits();
      throw new DomainError(t(change.error, limits), "joinCommitteeIds");
    }
  }
  const [term, days, who] = await Promise.all([
    getCurrentTerm(),
    requireConfig("requests.taskDays"),
    getPersonRecord(actor.personId),
  ]);
  if (!term || !who) {
    throw new DomainError(t("T-989"));
  }
  const kindLabel = requestKindLabel(kind);
  // Excusa (ADR-060 regla 5): una ocasión del término, no cancelada, sin asistencia registrada y
  // antes de la ocasión o hasta tres días hábiles después (Anexo 1, parágrafo 1).
  let occasionId: string | null = null;
  if (kind === "EXCUSE") {
    const excuse = payload as ExcusePayload;
    const row = (await getOccasionsByIds([excuse.occasionId])).get(excuse.occasionId);
    if (!row || row.termId !== term.id || row.status === "CANCELLED" || row.status === "DRAFT") {
      throw new DomainError(t("T-2227"), "occasionId");
    }
    if (excuseDeadline(row.startsAt) < new Date()) {
      throw new DomainError(t("T-2219"), "occasionId");
    }
    const existing = await findCheckIn(row.id, actor.personId);
    if (existing && (existing.status === "APPROVED" || existing.status === "EXCUSED")) {
      throw new DomainError(t("T-2223"), "occasionId");
    }
    occasionId = row.id;
  }
  return runCommand(actor, async (ctx) => {
    if (kind === "RESIGNATION") {
      const resignation = REQUEST_PAYLOAD_SCHEMAS.RESIGNATION.parse(payload);
      if (resignation.memorialConsent || resignation.contactConsent) {
        await requirePrivacyPolicyVersion(ctx);
      }
    }
    const [created] = await ctx.tx
      .insert(request)
      .values({ personId: actor.personId, kind, termId: term.id, occasionId, payload })
      .returning({ id: request.id })
      .catch((error: unknown) => {
        if (isUniqueViolation(error, "request_pending_unique")) {
          throw new DomainError(t("T-891", { tipo: kindLabel }));
        }
        if (isUniqueViolation(error, "request_excuse_pending_unique")) {
          throw new DomainError(t("T-2220"), "occasionId");
        }
        throw error;
      });
    if (!created) {
      throw new Error("No se pudo crear la solicitud");
    }
    const [opened] = await ctx.tx
      .insert(task)
      .values({
        title: t("T-1009", { nombre: `${who.firstName} ${who.lastName}`.trim(), tipo: kindLabel }),
        kind: "REQUEST",
        personId: actor.personId,
        createdById: actor.personId,
        dueAt: addBusinessDays(new Date(), days),
      })
      .returning({ id: task.id });
    await ctx.tx
      .update(request)
      .set({ taskId: opened?.id ?? null })
      .where(eq(request.id, created.id));
    await ctx.audit({
      action: "request.created",
      entityType: "request",
      entityId: created.id,
      after: { kind, payload },
    });
    await ctx.emit({
      type: "request.created",
      payload: {
        actorId: actor.personId,
        personId: actor.personId,
        requestId: created.id,
        kind,
        kindLabel,
      },
    });
    return { id: created.id };
  });
}

/** La persona retira su solicitud mientras esté pendiente; la tarea se cierra. */
export async function withdrawRequestAs(
  actor: Actor & { personId: string },
  requestId: string,
): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const [row] = await ctx.tx
      .select()
      .from(request)
      .where(eq(request.id, requestId))
      .for("update");
    if (!row || row.personId !== actor.personId) {
      throw new DomainError(t("T-032"));
    }
    if (row.status !== "PENDING") {
      throw new DomainError(t("T-1007"));
    }
    await ctx.tx
      .update(request)
      .set({ status: "WITHDRAWN", decidedAt: new Date() })
      .where(eq(request.id, requestId));
    if (row.taskId) {
      await completeTask(ctx, row.taskId);
    }
    await ctx.audit({
      action: "request.withdrawn",
      entityType: "request",
      entityId: requestId,
      before: { status: row.status },
      after: { status: "WITHDRAWN" },
    });
    await ctx.emit({
      type: "request.withdrawn",
      payload: {
        actorId: actor.personId,
        personId: row.personId,
        requestId,
        kind: row.kind,
        kindLabel: requestKindLabel(row.kind),
      },
    });
  });
}

export interface DecisionInput {
  decision: "APPROVED" | "REJECTED";
  reason?: string | undefined;
}

/**
 * GH decide (ADMIN): aprobar ejecuta el comando de `people` en la misma transacción (licencia, baja
 * con motivo retiro, o comités del término siguiente con transferencia); rechazar exige motivo.
 * Cierra la tarea y emite `request.decided` (línea de tiempo y correo T-205).
 */
export async function decideRequestAs(
  actor: Actor,
  requestId: string,
  input: DecisionInput,
): Promise<void> {
  const reason = input.reason?.trim() ?? "";
  if (input.decision === "REJECTED" && reason.length < 2) {
    throw new DomainError(t("T-1003"), "reason");
  }
  const current = await getRequest(requestId);
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  if (current.status !== "PENDING") {
    throw new DomainError(t("T-1007"));
  }
  // Lecturas cruzadas antes de la transacción (people y terms por getDb()).
  const [who, mine, term, limits] = await Promise.all([
    getPersonRecord(current.personId),
    current.kind === "TRANSFER" ? getMyMembership(current.personId) : Promise.resolve(null),
    getCurrentTerm(),
    committeeLimits(),
  ]);
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  return runCommand(actor, async (ctx) => {
    const [row] = await ctx.tx
      .select()
      .from(request)
      .where(eq(request.id, requestId))
      .for("update");
    if (!row || row.status !== "PENDING") {
      throw new DomainError(t("T-1007"));
    }
    let appliedTerm: TermRow | null = null;
    if (input.decision === "APPROVED") {
      appliedTerm = await apply(ctx, row, { mine, term, limits });
    }
    await ctx.tx
      .update(request)
      .set({
        status: input.decision,
        reason: reason || null,
        decidedById: ctx.actor.personId,
        decidedAt: new Date(),
      })
      .where(eq(request.id, requestId));
    if (row.taskId) {
      await completeTask(ctx, row.taskId);
    }
    await ctx.audit({
      action: input.decision === "APPROVED" ? "request.approved" : "request.rejected",
      entityType: "request",
      entityId: requestId,
      before: { status: "PENDING" },
      after: {
        status: input.decision,
        reason: reason || null,
        appliedTermId: appliedTerm?.id ?? null,
      },
    });
    await ctx.emit({
      type: "request.decided",
      payload: {
        actorId: ctx.actor.personId,
        personId: row.personId,
        requestId,
        kind: row.kind,
        kindLabel: requestKindLabel(row.kind),
        status: input.decision,
        reason: reason || null,
        email: who.email,
        firstName: who.preferredName || who.firstName,
      },
    });
  });
}

async function apply(
  ctx: CommandContext,
  row: RequestRecord,
  context: {
    mine: Awaited<ReturnType<typeof getMyMembership>> | null;
    term: TermRow | null;
    limits: { min: number; max: number };
  },
): Promise<TermRow | null> {
  if (row.kind === "EXCUSE") {
    const payload = REQUEST_PAYLOAD_SCHEMAS.EXCUSE.parse(row.payload);
    if (!row.occasionId) {
      throw new DomainError(t("T-2227"));
    }
    await excuseCheckIn(ctx, {
      occasionId: row.occasionId,
      personId: row.personId,
      reason: `${excuseCauseLabel(payload.cause)}: ${payload.reason}`,
    });
    return null;
  }
  if (row.kind === "LEAVE") {
    const payload = REQUEST_PAYLOAD_SCHEMAS.LEAVE.parse(row.payload);
    await changeMembershipStatus(ctx, row.personId, {
      to: "ON_LEAVE",
      reason: payload.reason,
      leaveUntil: payload.until,
    });
    return null;
  }
  if (row.kind === "RESIGNATION") {
    const payload = REQUEST_PAYLOAD_SCHEMAS.RESIGNATION.parse(row.payload);
    await endMembership(ctx, row.personId, {
      endReason: "RESIGNATION",
      note: payload.reason,
      memorialConsent: payload.memorialConsent,
      contactConsent: payload.contactConsent,
      personalEmail: payload.personalEmail,
      consentSource: "SELF",
    });
    return null;
  }
  const payload = REQUEST_PAYLOAD_SCHEMAS.TRANSFER.parse(row.payload);
  if (!context.term) {
    throw new DomainError(t("T-989"));
  }
  const change = resultingCommittees(
    (context.mine?.committees ?? []).map((item) => ({
      committeeId: item.committeeId,
      roleCode: item.roleCode,
    })),
    payload,
    context.limits,
  );
  if (change.error) {
    throw new DomainError(t(change.error, context.limits));
  }
  const next = await ensureNextTerm(ctx, context.term);
  await setCommitteeMemberships(ctx, row.personId, next.id, change.rows);
  return { ...context.term, id: next.id, code: next.code };
}

// Excusas por comité (ADR-060 regla 5): quien tiene PERMANENCE en el comité decide las excusas
// sobre las ocasiones de ese comité; la comprobación de la capacidad la hace la acción.

/** Excusas pendientes sobre ocasiones de un comité en un término, de la más reciente a la más vieja. */
export async function listPendingExcusesForCommittee(
  committeeId: string,
  termId: string,
): Promise<RequestView[]> {
  const occasionIds = (await listOccasionsForTerm(termId))
    .filter((row) => row.committeeId === committeeId)
    .map((row) => row.id);
  if (occasionIds.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select()
    .from(request)
    .where(
      and(
        eq(request.kind, "EXCUSE"),
        eq(request.status, "PENDING"),
        inArray(request.occasionId, occasionIds),
      ),
    )
    .orderBy(desc(request.createdAt));
  return toViews(rows);
}

/** La dirección del comité decide una excusa solo si la ocasión es de su comité. */
export async function decideExcuseForCommitteeAs(
  actor: Actor,
  requestId: string,
  committeeId: string,
  input: DecisionInput,
): Promise<void> {
  const current = await getRequest(requestId);
  if (!current || current.kind !== "EXCUSE" || !current.occasionId) {
    throw new DomainError(t("T-032"));
  }
  const row = (await getOccasionsByIds([current.occasionId])).get(current.occasionId);
  if (!row || row.committeeId !== committeeId) {
    throw new DomainError(t("T-032"));
  }
  await decideRequestAs(actor, requestId, input);
}
