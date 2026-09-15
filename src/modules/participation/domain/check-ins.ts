import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { lockOpenTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { checkIn, occasion } from "../schema";
import { applyPresentialCheckIn } from "./challenge-participation";
import {
  CHECK_IN_STATUSES,
  type CheckInDecision,
  type CheckInOutcome,
  type CheckInStatus,
  canTransitionCheckIn,
  initialStatus,
  outcomeFor,
  statusForDecision,
} from "./check-in-pure";
import { creditCheckIn, reverseCheckInCredit } from "./ledger";
import type { GamificationSettings } from "./member-context";
import { windowState } from "./occasion-pure";
import type { OccasionRow } from "./occasions";
import { verifyRotatingCode } from "./rotating-code-pure";

// Check-ins (ADR-006, ADR-035 reglas 5 y 6): un lock compartido del término coordina el cierre; el
// unique (ocasión, persona) decide los duplicados; el crédito nace en la misma transacción; los efectos
// (score, línea de tiempo, onboarding) viajan por outbox con payloads autosuficientes.

export type CheckInRow = typeof checkIn.$inferSelect;

export interface MembershipRef {
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  firstTermId: string;
}

const ELIGIBLE_STATUSES: readonly MembershipRef["status"][] = ["ACTIVE", "HONORARY"];

function statusLabel(status: CheckInStatus): string {
  return tList("T-597")[CHECK_IN_STATUSES.indexOf(status)] ?? status;
}

/** Señal para el wrapper: la fila ya existía (violación del unique dentro de la transacción). */
export class AlreadyCheckedIn extends Error {
  constructor(
    readonly occasionId: string,
    readonly personId: string,
  ) {
    super("check-in repetido");
    this.name = "AlreadyCheckedIn";
  }
}

async function readOccasion(ctx: CommandContext, id: string): Promise<OccasionRow | null> {
  const [row] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id)).limit(1);
  return row ?? null;
}

async function readCheckIn(
  ctx: CommandContext,
  occasionId: string,
  personId: string,
): Promise<CheckInRow | null> {
  const [row] = await ctx.tx
    .select()
    .from(checkIn)
    .where(and(eq(checkIn.occasionId, occasionId), eq(checkIn.personId, personId)))
    .limit(1);
  return row ?? null;
}

function approvedPayload(row: OccasionRow, personId: string, source: string) {
  return {
    occasionId: row.id,
    occasionTitle: row.title,
    personId,
    termId: row.termId,
    category: row.category,
    kind: row.kind,
    points: row.points,
    source,
  };
}

async function emitApproved(
  ctx: CommandContext,
  row: OccasionRow,
  personId: string,
  source: string,
) {
  await ctx.emit({ type: "checkin.approved", payload: approvedPayload(row, personId, source) });
  if (row.points > 0) {
    await ctx.emit({
      type: "score.recompute",
      payload: { occasionId: row.id },
      dedupeKey: `score:${row.id}`,
    });
  }
}

// Check-in propio desde /a/[publicId].

export interface SelfCheckInInput {
  occasionId: string;
  personId: string;
  code?: string | null | undefined;
  now?: Date | undefined;
}

export interface SelfCheckInContext {
  membership: MembershipRef | null;
  /** Sin settings no hay gancho de retos (llamadas antiguas). */
  settings?: GamificationSettings | undefined;
}

export type SelfCheckInDenial =
  | "NOT_FOUND"
  | "DRAFT"
  | "CANCELLED"
  | "CLOSED"
  | "TERM_CLOSED"
  | "NOT_OPEN_YET"
  | "WINDOW_CLOSED"
  | "NOT_ELIGIBLE"
  | "NEW_MEMBERS_ONLY"
  | "CODE_REQUIRED"
  | "BAD_CODE";

export type SelfCheckInResult =
  | {
      ok: true;
      outcome: CheckInOutcome;
      status: CheckInStatus;
      points: number;
      checkInId: string;
    }
  | { ok: false; reason: SelfCheckInDenial; opensAt?: Date }
  | { ok: false; reason: "ALREADY"; existing: CheckInRow };

/** Valida en orden: ocasión → estado → término → ventana → membresía → solo nuevos → código. */
export async function checkInSelf(
  ctx: CommandContext,
  input: SelfCheckInInput,
  context: SelfCheckInContext,
): Promise<SelfCheckInResult> {
  const now = input.now ?? new Date();
  const row = await readOccasion(ctx, input.occasionId);
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const existing = await readCheckIn(ctx, row.id, input.personId);
  if (existing) {
    return { ok: false, reason: "ALREADY", existing };
  }
  if (row.status === "DRAFT" || row.status === "CANCELLED" || row.status === "CLOSED") {
    return { ok: false, reason: row.status };
  }
  try {
    await lockOpenTermPoints(ctx.tx, row.termId);
  } catch (error) {
    if (error instanceof DomainError && error.message === t("T-629")) {
      return { ok: false, reason: "TERM_CLOSED" };
    }
    throw error;
  }
  const window = windowState(row, now);
  if (window === "NOT_OPEN") {
    return { ok: false, reason: "NOT_OPEN_YET", opensAt: row.checkInOpensAt };
  }
  if (window === "CLOSED") {
    return { ok: false, reason: "WINDOW_CLOSED" };
  }
  if (!context.membership || !ELIGIBLE_STATUSES.includes(context.membership.status)) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }
  if (row.newMembersOnly && context.membership.firstTermId !== row.termId) {
    return { ok: false, reason: "NEW_MEMBERS_ONLY" };
  }
  if (row.requireRotatingCode) {
    const code = input.code?.trim() ?? "";
    if (!code) {
      return { ok: false, reason: "CODE_REQUIRED" };
    }
    if (!row.rotatingSecret || !verifyRotatingCode(row.rotatingSecret, row.id, code, now)) {
      return { ok: false, reason: "BAD_CODE" };
    }
  }
  const status = initialStatus("SELF_QR", row.approval);
  let created: CheckInRow | undefined;
  try {
    [created] = await ctx.tx
      .insert(checkIn)
      .values({
        occasionId: row.id,
        personId: input.personId,
        status,
        source: "SELF_QR",
        at: now,
        decidedAt: status === "APPROVED" ? now : null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, "check_in_occasion_person_unique")) {
      // La transacción quedó abortada: el wrapper lee la fila existente afuera.
      throw new AlreadyCheckedIn(row.id, input.personId);
    }
    throw error;
  }
  if (!created) {
    throw new Error("No se pudo registrar el check-in");
  }
  if (status === "APPROVED") {
    await creditCheckIn(ctx, {
      checkInId: created.id,
      personId: input.personId,
      termId: row.termId,
      points: row.points,
      reason: row.title,
    });
  }
  await ctx.audit({
    action: "checkin.created",
    entityType: "check_in",
    entityId: created.id,
    after: { occasionId: row.id, personId: input.personId, status, source: "SELF_QR" },
  });
  if (status === "APPROVED") {
    await emitApproved(ctx, row, input.personId, "SELF_QR");
  } else {
    await ctx.emit({
      type: "checkin.pending",
      payload: approvedPayload(row, input.personId, "SELF_QR"),
    });
  }
  // ADR-067 regla 12: el reto presencial vinculado a la ocasión sigue el desenlace del check-in.
  if (context.settings) {
    await applyPresentialCheckIn(
      ctx,
      {
        checkIn: created,
        occasion: row,
        outcome: status === "APPROVED" ? "APPROVED" : "PENDING",
        now,
      },
      { settings: context.settings },
    );
  }
  return {
    ok: true,
    outcome: outcomeFor(status, row.points),
    status,
    points: status === "APPROVED" ? row.points : 0,
    checkInId: created.id,
  };
}

// Check-in por el organizador (modo anfitrión o alta manual desde la consola).

export interface HostCheckInInput {
  occasionId: string;
  personId: string;
  personName: string;
  source: "HOST" | "ADMIN";
  now?: Date;
}

/** El organizador da fe: nace aprobado aunque la ocasión sea de aprobación manual. Reaprueba un rechazo. */
export async function hostCheckIn(
  ctx: CommandContext,
  input: HostCheckInInput,
  context: { membership: MembershipRef | null; settings?: GamificationSettings | undefined },
): Promise<{ checkInId: string; points: number }> {
  const now = input.now ?? new Date();
  const row = await readOccasion(ctx, input.occasionId);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "OPEN" && !(input.source === "ADMIN" && row.status === "CLOSED")) {
    throw new DomainError(
      input.source === "HOST" ? t("T-620") : t("T-578", { estado: row.status }),
    );
  }
  if (!context.membership || !ELIGIBLE_STATUSES.includes(context.membership.status)) {
    throw new DomainError(t("T-673", { nombre: input.personName }));
  }
  if (row.newMembersOnly && context.membership.firstTermId !== row.termId) {
    throw new DomainError(t("T-674", { nombre: input.personName }));
  }
  await lockOpenTermPoints(ctx.tx, row.termId);
  const existing = await readCheckIn(ctx, row.id, input.personId);
  if (existing) {
    if (!canTransitionCheckIn(existing.status, "APPROVED")) {
      throw new DomainError(t("T-601", { nombre: input.personName }));
    }
    await decide(ctx, existing, row, "APPROVE", null, now, context.settings);
    return { checkInId: existing.id, points: row.points };
  }
  let created: CheckInRow | undefined;
  try {
    [created] = await ctx.tx
      .insert(checkIn)
      .values({
        occasionId: row.id,
        personId: input.personId,
        status: "APPROVED",
        source: input.source,
        at: now,
        decidedById: ctx.actor.personId,
        decidedAt: now,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, "check_in_occasion_person_unique")) {
      throw new AlreadyCheckedIn(row.id, input.personId);
    }
    throw error;
  }
  if (!created) {
    throw new Error("No se pudo registrar el check-in");
  }
  await creditCheckIn(ctx, {
    checkInId: created.id,
    personId: input.personId,
    termId: row.termId,
    points: row.points,
    reason: row.title,
  });
  await ctx.audit({
    action: "checkin.created",
    entityType: "check_in",
    entityId: created.id,
    after: {
      occasionId: row.id,
      personId: input.personId,
      status: "APPROVED",
      source: input.source,
    },
  });
  await emitApproved(ctx, row, input.personId, input.source);
  if (context.settings) {
    await applyPresentialCheckIn(
      ctx,
      { checkIn: created, occasion: row, outcome: "APPROVED", now },
      { settings: context.settings },
    );
  }
  return { checkInId: created.id, points: row.points };
}

// Decisiones sobre un check-in (aprobar, rechazar, anular).

async function decide(
  ctx: CommandContext,
  current: CheckInRow,
  row: OccasionRow,
  decision: CheckInDecision,
  reason: string | null,
  now: Date,
  settings?: GamificationSettings,
): Promise<void> {
  await lockOpenTermPoints(ctx.tx, row.termId);
  const target = statusForDecision(decision);
  if (!canTransitionCheckIn(current.status, target)) {
    throw new DomainError(t("T-676", { estado: statusLabel(current.status).toLowerCase() }));
  }
  const cleanReason = reason?.trim() || null;
  if (decision === "CANCEL" && !cleanReason) {
    throw new DomainError(t("T-609"), "reason");
  }
  await ctx.tx
    .update(checkIn)
    .set({ status: target, decidedById: ctx.actor.personId, decidedAt: now, reason: cleanReason })
    .where(eq(checkIn.id, current.id));
  let reversed = 0;
  if (decision === "APPROVE") {
    await creditCheckIn(ctx, {
      checkInId: current.id,
      personId: current.personId,
      termId: row.termId,
      points: row.points,
      reason: row.title,
    });
  } else if (decision === "CANCEL") {
    reversed = await reverseCheckInCredit(ctx, current.id, cleanReason ?? "");
  }
  await ctx.audit({
    action: `checkin.${decision.toLowerCase()}`,
    entityType: "check_in",
    entityId: current.id,
    before: { status: current.status },
    after: { status: target, reason: cleanReason, reversed },
  });
  if (decision === "APPROVE") {
    await emitApproved(ctx, row, current.personId, current.source);
  } else if (decision === "CANCEL") {
    await ctx.emit({
      type: "checkin.cancelled",
      payload: { ...approvedPayload(row, current.personId, current.source), reason: cleanReason },
    });
    if (row.points > 0) {
      await ctx.emit({
        type: "score.recompute",
        payload: { occasionId: row.id },
        dedupeKey: `score:${row.id}`,
      });
    }
  }
  // ADR-067 regla 12: aprobar completa el reto presencial, rechazar lo libera y anular lo revierte.
  if (settings) {
    const outcome =
      decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CANCELLED";
    await applyPresentialCheckIn(
      ctx,
      {
        checkIn: { ...current, status: target },
        occasion: row,
        outcome,
        reason: cleanReason,
        now,
      },
      { settings },
    );
  }
}

export interface DecideInput {
  checkInId: string;
  decision: CheckInDecision;
  reason?: string | null | undefined;
  now?: Date | undefined;
}

export async function decideCheckIn(
  ctx: CommandContext,
  input: DecideInput,
  context?: { settings?: GamificationSettings | undefined },
): Promise<void> {
  const [current] = await ctx.tx.select().from(checkIn).where(eq(checkIn.id, input.checkInId));
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  const row = await readOccasion(ctx, current.occasionId);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await decide(
    ctx,
    current,
    row,
    input.decision,
    input.reason ?? null,
    input.now ?? new Date(),
    context?.settings,
  );
}

export async function decideMany(
  ctx: CommandContext,
  checkInIds: string[],
  decision: CheckInDecision,
  reason?: string | null,
  context?: { settings?: GamificationSettings | undefined },
): Promise<number> {
  const now = new Date();
  for (const checkInId of checkInIds) {
    await decideCheckIn(ctx, { checkInId, decision, reason, now }, context);
  }
  return checkInIds.length;
}

/** Al cancelar la ocasión: anula pendientes y aprobados, revierte los créditos vivos y avisa a cada persona. */
export async function cancelOccasionCheckIns(
  ctx: CommandContext,
  row: OccasionRow,
  reason: string,
  now = new Date(),
  settings?: GamificationSettings,
): Promise<number> {
  await lockOpenTermPoints(ctx.tx, row.termId);
  const rows = await ctx.tx
    .select()
    .from(checkIn)
    .where(and(eq(checkIn.occasionId, row.id), inArray(checkIn.status, ["PENDING", "APPROVED"])));
  for (const current of rows) {
    await ctx.tx
      .update(checkIn)
      .set({ status: "CANCELLED", decidedById: ctx.actor.personId, decidedAt: now, reason })
      .where(eq(checkIn.id, current.id));
    if (current.status === "APPROVED") {
      await reverseCheckInCredit(ctx, current.id, reason);
    }
    await ctx.emit({
      type: "checkin.cancelled",
      payload: { ...approvedPayload(row, current.personId, current.source), reason },
    });
    // ADR-067 regla 12: cancelar la ocasión anula la participación del reto presencial.
    if (settings) {
      await applyPresentialCheckIn(
        ctx,
        {
          checkIn: { ...current, status: "CANCELLED" },
          occasion: row,
          outcome: "CANCELLED",
          reason,
          now,
        },
        { settings },
      );
    }
  }
  if (rows.length > 0 && row.points > 0) {
    await ctx.emit({
      type: "score.recompute",
      payload: { occasionId: row.id },
      dedupeKey: `score:${row.id}`,
    });
  }
  return rows.length;
}

// Excusa válida aceptada (ADR-060 regla 5): la escribe crm al aprobar la solicitud, en la misma
// transacción. Sin puntos ni score; el efecto sobre permanencia viaja por `checkin.excused`.

export interface ExcuseInput {
  occasionId: string;
  personId: string;
  reason: string;
  now?: Date | undefined;
}

export async function excuseCheckIn(ctx: CommandContext, input: ExcuseInput): Promise<void> {
  const row = await readOccasion(ctx, input.occasionId);
  if (!row || row.status === "CANCELLED") {
    throw new DomainError(t("T-2227"));
  }
  const now = input.now ?? new Date();
  const reason = input.reason.trim() || null;
  const current = await readCheckIn(ctx, row.id, input.personId);
  if (current?.status === "EXCUSED") {
    return;
  }
  if (current && !canTransitionCheckIn(current.status, "EXCUSED")) {
    throw new DomainError(t("T-2223"));
  }
  if (current) {
    await ctx.tx
      .update(checkIn)
      .set({ status: "EXCUSED", decidedById: ctx.actor.personId, decidedAt: now, reason })
      .where(eq(checkIn.id, current.id));
  } else {
    await ctx.tx.insert(checkIn).values({
      occasionId: row.id,
      personId: input.personId,
      status: "EXCUSED",
      source: "ADMIN",
      at: now,
      decidedById: ctx.actor.personId,
      decidedAt: now,
      reason,
    });
  }
  await ctx.audit({
    action: "checkin.excused",
    entityType: "check_in",
    entityId: `${row.id}:${input.personId}`,
    before: current ? { status: current.status } : null,
    after: { status: "EXCUSED", reason },
  });
  await ctx.emit({
    type: "checkin.excused",
    payload: { ...approvedPayload(row, input.personId, "ADMIN"), reason },
  });
}

// Lecturas.

export async function findCheckIn(
  occasionId: string,
  personId: string,
): Promise<CheckInRow | null> {
  const [row] = await getDb()
    .select()
    .from(checkIn)
    .where(and(eq(checkIn.occasionId, occasionId), eq(checkIn.personId, personId)))
    .limit(1);
  return row ?? null;
}

/** Check-ins de una ocasión, del más reciente al más viejo; con `statuses` acota por estado. */
export async function listCheckIns(
  occasionId: string,
  statuses?: readonly CheckInStatus[],
): Promise<CheckInRow[]> {
  const where = statuses
    ? and(eq(checkIn.occasionId, occasionId), inArray(checkIn.status, [...statuses]))
    : eq(checkIn.occasionId, occasionId);
  return getDb().select().from(checkIn).where(where).orderBy(desc(checkIn.at));
}

/** Check-ins de una persona (todas las ocasiones), del más reciente al más viejo. */
export async function listCheckInsForPerson(personId: string): Promise<CheckInRow[]> {
  return getDb()
    .select()
    .from(checkIn)
    .where(eq(checkIn.personId, personId))
    .orderBy(desc(checkIn.at));
}

// Lecturas para permanencia (ADR-036): check-ins aprobados del término, sin más columnas.

export interface ApprovedCheckIn {
  personId: string;
  occasionId: string;
}

export async function listApprovedCheckInsForTerm(termId: string): Promise<ApprovedCheckIn[]> {
  return getDb()
    .select({ personId: checkIn.personId, occasionId: checkIn.occasionId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(and(eq(occasion.termId, termId), eq(checkIn.status, "APPROVED")));
}

/** Ocasiones del término con excusa aceptada, por persona (ADR-060 regla 5). */
export async function listExcusedCheckInsForTerm(termId: string): Promise<ApprovedCheckIn[]> {
  return getDb()
    .select({ personId: checkIn.personId, occasionId: checkIn.occasionId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(and(eq(occasion.termId, termId), eq(checkIn.status, "EXCUSED")));
}

export async function listExcusedCheckInsForPersonInTerm(
  personId: string,
  termId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(
      and(
        eq(occasion.termId, termId),
        eq(checkIn.personId, personId),
        eq(checkIn.status, "EXCUSED"),
      ),
    );
  return rows.map((row) => row.occasionId);
}

export async function listApprovedCheckInsForPersonInTerm(
  personId: string,
  termId: string,
): Promise<string[]> {
  const rows = await getDb()
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(
      and(
        eq(occasion.termId, termId),
        eq(checkIn.personId, personId),
        eq(checkIn.status, "APPROVED"),
      ),
    );
  return rows.map((row) => row.occasionId);
}
