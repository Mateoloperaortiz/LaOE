import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import {
  checkinApproved,
  checkinCancelled,
  checkinExcused,
  checkinPending,
  scoreRecompute,
} from "@/domain-events/participation";
import { lockPersonAnonymization } from "@/modules/people";
import { lockOpenTermPoints } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { checkIn, occasion } from "../schema";
import { type BoosterRow, setBoosterTarget } from "./boosters";
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
import { applyCheckInBoost } from "./checkin-boost";
import { creditCheckIn, reverseCheckInCredit } from "./ledger";
import type { GamificationSettings, MemberContext } from "./member-context";
import { windowState } from "./occasion-pure";
import type { OccasionRow } from "./occasions";
import { verifyRotatingCode } from "./rotating-code-pure";

// Check-ins (ADR-006, ADR-035 reglas 5 y 6): un lock compartido del término coordina el cierre; el
// unique (ocasión, persona) decide los duplicados; el crédito nace en la misma transacción; los efectos
// (score, línea de tiempo, onboarding) viajan por outbox con payloads autosuficientes.
//
// Orden de candados (ADR-116 regla 2), el mismo en todos los caminos: término (compartido) → persona
// (compartido, solo la excusa) → asistencias (fila, por id) → premio (`reward:<persona>`, su fila, el
// booster) → reto presencial y su entrega. La excusa no toma el del término (regla 3).

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

/**
 * Asistencias que ya existen, tomadas para cambiarlas (ADR-116 regla 1): con candado de fila y en
 * orden de id. Toda transición valida contra lo que devuelve esto y nunca contra una lectura
 * anterior: otra decisión sobre la misma asistencia espera aquí y encuentra lo que dejó la primera.
 */
async function lockCheckIns(ctx: CommandContext, where: SQL | undefined): Promise<CheckInRow[]> {
  return ctx.tx.select().from(checkIn).where(where).orderBy(asc(checkIn.id)).for("update");
}

function ofPerson(occasionId: string, personId: string): SQL | undefined {
  return and(eq(checkIn.occasionId, occasionId), eq(checkIn.personId, personId));
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
  await ctx.emit(eventOf(checkinApproved, approvedPayload(row, personId, source)));
  if (row.points > 0) {
    await ctx.emit(
      eventOf(scoreRecompute, { occasionId: row.id }, { dedupeKey: `score:${row.id}` }),
    );
  }
}

// Check-in propio desde /a/[publicId].

export interface SelfCheckInInput {
  occasionId: string;
  personId: string;
  code?: string | null | undefined;
  /** Booster a apuntar a la ocasión dentro de la misma transacción (ADR-067 regla 8). */
  boosterId?: string | null | undefined;
  now?: Date | undefined;
}

export interface SelfCheckInContext {
  membership: MembershipRef | null;
  /** Sin settings no hay gancho de retos ni de boosters (llamadas antiguas). */
  settings?: GamificationSettings | undefined;
  /** Contexto del miembro para validar el objetivo del booster. */
  member?: MemberContext | null | undefined;
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
  | "BAD_CODE"
  | "BOOSTER";

export type SelfCheckInResult =
  | {
      ok: true;
      outcome: CheckInOutcome;
      status: CheckInStatus;
      points: number;
      checkInId: string;
    }
  | { ok: false; reason: SelfCheckInDenial; opensAt?: Date; message?: string }
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
  let selectedBooster: BoosterRow | undefined;
  if (input.boosterId && context.settings) {
    // Mismo orden que reserveReward: persona antes que booster, también en carreras con trivia.
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${input.personId}`}, 0))`,
    );
    try {
      selectedBooster = await setBoosterTarget(
        ctx,
        {
          personId: input.personId,
          boosterId: input.boosterId,
          target: { occasionId: row.id },
          now,
          allowUnavailable: true,
        },
        { member: context.member ?? null, settings: context.settings },
      );
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, reason: "BOOSTER", message: error.message };
      }
      throw error;
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
    await ctx.emit(eventOf(checkinPending, approvedPayload(row, input.personId, "SELF_QR")));
  }
  // ADR-067 reglas 8 y 12: el booster de la ocasión se resuelve antes que el reto presencial.
  if (context.settings) {
    await applyCheckInBoost(
      ctx,
      {
        checkIn: created,
        occasion: row,
        outcome: status === "APPROVED" ? "APPROVED" : "PENDING",
        selectedBooster,
        now,
      },
      { settings: context.settings },
    );
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
  const [existing] = await lockCheckIns(ctx, ofPerson(row.id, input.personId));
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
    await applyCheckInBoost(
      ctx,
      { checkIn: created, occasion: row, outcome: "APPROVED", now },
      { settings: context.settings },
    );
    await applyPresentialCheckIn(
      ctx,
      { checkIn: created, occasion: row, outcome: "APPROVED", now },
      { settings: context.settings },
    );
  }
  return { checkInId: created.id, points: row.points };
}

// Decisiones sobre un check-in (aprobar, rechazar, anular).

/** `current` llega de `lockCheckIns`, con el término ya tomado: se valida contra la fila retenida. */
async function decide(
  ctx: CommandContext,
  current: CheckInRow,
  row: OccasionRow,
  decision: CheckInDecision,
  reason: string | null,
  now: Date,
  settings?: GamificationSettings,
): Promise<void> {
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
    await ctx.emit(
      eventOf(checkinCancelled, {
        ...approvedPayload(row, current.personId, current.source),
        reason: cleanReason,
      }),
    );
    if (row.points > 0) {
      await ctx.emit(
        eventOf(scoreRecompute, { occasionId: row.id }, { dedupeKey: `score:${row.id}` }),
      );
    }
  }
  // ADR-067 regla 12: aprobar completa el reto presencial, rechazar lo libera y anular lo revierte.
  if (settings) {
    const outcome =
      decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CANCELLED";
    await applyCheckInBoost(
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

/**
 * Decide una asistencia por su id. La primera lectura va sin candado y solo dice de qué ocasión es,
 * que no cambia; el estado se lee con la fila tomada, después del término. `onlyPending` es la regla
 * del lote: lo que ya no está pendiente lo decidió otro y recibe el error de transición.
 */
async function decideById(
  ctx: CommandContext,
  input: DecideInput,
  settings: GamificationSettings | undefined,
  onlyPending: boolean,
): Promise<void> {
  const [found] = await ctx.tx
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .where(eq(checkIn.id, input.checkInId));
  if (!found) {
    throw new DomainError(t("T-032"));
  }
  const row = await readOccasion(ctx, found.occasionId);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await lockOpenTermPoints(ctx.tx, row.termId);
  const [current] = await lockCheckIns(ctx, eq(checkIn.id, input.checkInId));
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  if (onlyPending && current.status !== "PENDING") {
    throw new DomainError(t("T-676", { estado: statusLabel(current.status).toLowerCase() }));
  }
  await decide(
    ctx,
    current,
    row,
    input.decision,
    input.reason ?? null,
    input.now ?? new Date(),
    settings,
  );
}

export async function decideCheckIn(
  ctx: CommandContext,
  input: DecideInput,
  context?: { settings?: GamificationSettings | undefined },
): Promise<void> {
  await decideById(ctx, input, context?.settings, false);
}

/** Anular no es una decisión de lote: solo se anula una asistencia aprobada, y el lote decide pendientes. */
export type BatchDecision = Exclude<CheckInDecision, "CANCEL">;

/**
 * Lote de la consola («Aprobar todos»). La lista llega leída antes de la transacción, así que cada
 * asistencia debe seguir pendiente cuando se toma su fila (ADR-116 regla 4): un rechazo que entró
 * en el medio no se reaprueba en silencio, y el lote entero se deshace con el error de transición.
 * Las recorre en orden de id, el mismo de `lockCheckIns`. Devuelve cuántas decidió.
 */
export async function decideMany(
  ctx: CommandContext,
  checkInIds: string[],
  decision: BatchDecision,
  reason?: string | null,
  context?: { settings?: GamificationSettings | undefined },
): Promise<number> {
  if (checkInIds.length === 0) {
    return 0;
  }
  const now = new Date();
  // El orden lo da la base y no `sort()`: tiene que ser el de `order by id` de quien toma varias.
  const ordered = await ctx.tx
    .select({ id: checkIn.id })
    .from(checkIn)
    .where(inArray(checkIn.id, checkInIds))
    .orderBy(asc(checkIn.id));
  if (ordered.length !== new Set(checkInIds).size) {
    throw new DomainError(t("T-032"));
  }
  for (const { id } of ordered) {
    await decideById(ctx, { checkInId: id, decision, reason, now }, context?.settings, true);
  }
  return ordered.length;
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
  // Se toman todas las de la ocasión y se filtra con la fila retenida: un rechazo que alguien está
  // reaprobando no estaba pendiente ni aprobado al mirar, y sin esperarlo quedaría vivo.
  const rows = (await lockCheckIns(ctx, eq(checkIn.occasionId, row.id))).filter(
    (item) => item.status === "PENDING" || item.status === "APPROVED",
  );
  for (const current of rows) {
    await ctx.tx
      .update(checkIn)
      .set({ status: "CANCELLED", decidedById: ctx.actor.personId, decidedAt: now, reason })
      .where(eq(checkIn.id, current.id));
    if (current.status === "APPROVED") {
      await reverseCheckInCredit(ctx, current.id, reason);
    }
    await ctx.emit(
      eventOf(checkinCancelled, {
        ...approvedPayload(row, current.personId, current.source),
        reason,
      }),
    );
    // ADR-067 regla 12: cancelar la ocasión anula la participación del reto presencial.
    if (settings) {
      await applyCheckInBoost(
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
    await ctx.emit(
      eventOf(scoreRecompute, { occasionId: row.id }, { dedupeKey: `score:${row.id}` }),
    );
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

/** La configuración es obligatoria: sin ella la reserva de una asistencia pendiente quedaría viva. */
export async function excuseCheckIn(
  ctx: CommandContext,
  input: ExcuseInput,
  context: { settings: GamificationSettings },
): Promise<void> {
  const row = await readOccasion(ctx, input.occasionId);
  if (!row || row.status === "CANCELLED") {
    throw new DomainError(t("T-2227"));
  }
  const now = input.now ?? new Date();
  // ADR-114 regla 4: el motivo es texto de la persona y no se escribe si ya fue anonimizada, ni en
  // la asistencia, ni en la auditoría, ni en el evento. Se mira con candado dentro de la transacción:
  // una anonimización que llegue ahora espera, y su aviso borra lo que aquí quede escrito.
  const who = await lockPersonAnonymization(ctx.tx, input.personId);
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  const reason = who.anonymized ? null : input.reason.trim() || null;
  // ADR-116 reglas 2 y 3: la persona va antes que la asistencia, como ya iba (la fila se tomaba al
  // escribirla), y sin el candado de puntos del término: la excusa no escribe en el ledger ni en
  // nada que el cierre de puntos congele.
  const [current] = await lockCheckIns(ctx, ofPerson(row.id, input.personId));
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
  await ctx.emit(
    eventOf(checkinExcused, { ...approvedPayload(row, input.personId, "ADMIN"), reason }),
  );
  // ADR-067 regla 3 y ADR-111: la excusa cierra la asistencia sin aprobarla, así que con el premio
  // hace lo mismo que un rechazo: libera la reserva del booster y después la del reto presencial. El
  // motivo del premio es el estado y el de la entrega dice que la asistencia quedó excusada; ninguno
  // es el texto de la persona (una causal médica no se copia a otra tabla).
  if (current) {
    const excused: CheckInRow = { ...current, status: "EXCUSED" };
    const releaseReason = statusLabel("EXCUSED");
    const closing = {
      checkIn: excused,
      occasion: row,
      outcome: "REJECTED",
      reason: releaseReason,
      rejectionReason: t("T-3205", { actividad: row.title }),
      now,
    } as const;
    await applyCheckInBoost(ctx, closing, context);
    await applyPresentialCheckIn(ctx, closing, context);
  }
}

/**
 * Retiro de datos personales (ADR-114 regla 4): vacía el motivo de las asistencias excusadas de la
 * persona, que es su causal y su texto. La asistencia sigue excusada, con quién y cuándo la decidió;
 * el motivo de un rechazo o de una anulación lo escribió GH y no se toca. Devuelve cuántas tocó.
 */
export async function clearExcuseReasonsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .update(checkIn)
    .set({ reason: null })
    .where(and(eq(checkIn.personId, personId), eq(checkIn.status, "EXCUSED")))
    .returning({ id: checkIn.id });
  return rows.length;
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
