import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { lockPersonAnonymization } from "@/modules/people";
import { lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { checkIn, occasion } from "../schema";
import {
  CHECK_IN_STATUSES,
  type CheckInDecision,
  type CheckInOutcome,
  type CheckInStatus,
  canCancelWithOccasion,
  canTransitionCheckIn,
  closedToSelf,
  ELIGIBLE_STATUSES,
  initialStatus,
  type MembershipRef,
  outcomeFor,
  type SelfCheckInEligibilityDenial,
  selfCheckInEligibilityDenial,
  statusForDecision,
} from "./check-in-pure";
import { AlreadyCheckedIn, checkInStatusLabel, transitionCheckIn } from "./check-in-transition";
import type { GamificationSettings, MemberContext } from "./member-context";
import { type OccasionRow, occasionStateError } from "./occasions";
import { verifyRotatingCode } from "./rotating-code-pure";

// Check-ins (ADR-006, ADR-035 reglas 5 y 6): un lock compartido del término coordina el cierre; el
// unique (ocasión, persona) decide los duplicados; el crédito nace en la misma transacción; los efectos
// (score, línea de tiempo, onboarding) viajan por outbox con payloads autosuficientes.
//
// Cada camino de este archivo valida sus condiciones de entrada, toma sus candados y hace una sola
// llamada a `transitionCheckIn` (check-in-transition.ts, ADR-119 regla 4), que escribe la fila, el
// crédito, la auditoría y los eventos y corre los ganchos del premio. Ninguno lo hace por su cuenta.
//
// Orden de candados (ADR-116 regla 2 y ADR-119 regla 1), el mismo en todos los caminos: término
// (compartido) → ocasión (compartido; abrir, cerrar y cancelar la toman exclusiva) → persona
// (compartido, solo la excusa) → asistencias (fila, por id; la que nace se inserta en este lugar,
// ADR-119 regla 3) → recálculo del puntaje (`score:<ocasión>`
// en el outbox: un solo pendiente, el segundo que lo encola espera al primero) → premio
// (`reward:<persona>`, su fila, el booster) → reto presencial y su entrega. Quien toma varias
// asistencias las toma todas antes de encolar nada: nadie espera una fila con el recálculo encolado.
// La excusa no toma el del término (regla 3).

export type CheckInRow = typeof checkIn.$inferSelect;

async function readOccasion(ctx: CommandContext, id: string): Promise<OccasionRow | null> {
  const [row] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id)).limit(1);
  return row ?? null;
}

/**
 * La ocasión, tomada para leer su estado (ADR-119 regla 1). Quien crea o decide una asistencia la toma
 * después del término y valida contra lo que devuelve esto, nunca contra la lectura anterior. Abrir,
 * cerrar y cancelar la toman `for update` (`transition`, en occasions.ts): la cancelación que va en
 * curso se espera aquí y se encuentra hecha, y la que llega después espera a que la asistencia
 * confirme y la anula. `observed` es la lectura sin candado, que solo dijo de qué término era.
 */
async function lockOccasion(ctx: CommandContext, observed: OccasionRow): Promise<OccasionRow> {
  const [row] = await ctx.tx
    .select()
    .from(occasion)
    .where(eq(occasion.id, observed.id))
    .for("share");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  // Solo un borrador cambia de término: si pasó entre las dos lecturas, el candado tomado no es el suyo.
  if (row.termId !== observed.termId) {
    throw new DomainError(t("T-260"));
  }
  return row;
}

/** El organizador registra con la ocasión abierta; la consola, también con la ocasión cerrada. */
function assertOpenForOrganizer(row: OccasionRow, source: "HOST" | "ADMIN"): void {
  if (row.status !== "OPEN" && !(source === "ADMIN" && row.status === "CLOSED")) {
    throw source === "HOST" ? new DomainError(t("T-620")) : occasionStateError(row.status);
  }
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
 * La condición es obligatoria: sin ella tomaría la tabla entera. `for no key update` es el candado
 * que toma el `update` que sigue: excluye a los otros caminos igual que `for update` y no frena a
 * quien solo referencia la asistencia por clave foránea.
 */
async function lockCheckIns(ctx: CommandContext, where: SQL): Promise<CheckInRow[]> {
  return ctx.tx.select().from(checkIn).where(where).orderBy(asc(checkIn.id)).for("no key update");
}

function ofPerson(occasionId: string, personId: string): SQL {
  return sql`${eq(checkIn.occasionId, occasionId)} and ${eq(checkIn.personId, personId)}`;
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
  /** Obligatoria (ADR-119 regla 4): los ganchos del premio corren en toda transición. */
  settings: GamificationSettings;
  /** Contexto del miembro para validar el objetivo del booster. */
  member?: MemberContext | null | undefined;
}

export type SelfCheckInDenial =
  | "NOT_FOUND"
  | SelfCheckInEligibilityDenial
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

/**
 * Valida en orden: ocasión → estado → término → ventana → membresía → solo nuevos → código. De
 * estado a solo nuevos el motivo lo decide `selfCheckInEligibilityDenial` (ADR-120 regla 17), con el término y
 * la ocasión ya tomados. Si otro registro ganó el índice único lanza `AlreadyCheckedIn`, y si el
 * booster elegido no vale, `BoosterDenied`: las dos señales deshacen la transacción y el wrapper las
 * responde afuera.
 */
export async function checkInSelf(
  ctx: CommandContext,
  input: SelfCheckInInput,
  context: SelfCheckInContext,
): Promise<SelfCheckInResult> {
  const now = input.now ?? new Date();
  const observed = await readOccasion(ctx, input.occasionId);
  if (!observed) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const existing = await readCheckIn(ctx, observed.id, input.personId);
  if (existing) {
    return { ok: false, reason: "ALREADY", existing };
  }
  // Sobre la lectura sin candado solo se adelanta el primer peldaño, que no depende de nada más: una
  // ocasión que no recibe registros responde sin tomar el término ni su fila.
  const closed = closedToSelf(observed.status);
  if (closed) {
    return { ok: false, reason: closed };
  }
  // Que el término haya cerrado sus puntos es un dato del motivo, no un error.
  let termClosed = false;
  try {
    await lockOpenTermPoints(ctx.tx, observed.termId);
  } catch (error) {
    if (!(error instanceof DomainError && error.message === t("T-629"))) {
      throw error;
    }
    termClosed = true;
  }
  // ADR-119 regla 1: el estado se vuelve a leer con la ocasión tomada. La que se canceló o se cerró
  // entre la primera lectura y el candado responde lo mismo que si ya lo estuviera al llegar. Con el
  // término cerrado no se toma: nada se va a escribir.
  const row = termClosed ? observed : await lockOccasion(ctx, observed);
  const denial = selfCheckInEligibilityDenial({
    occasion: row,
    termClosed,
    membership: context.membership,
    now,
  });
  if (denial) {
    return denial === "NOT_OPEN_YET"
      ? { ok: false, reason: denial, opensAt: row.checkInOpensAt }
      : { ok: false, reason: denial };
  }
  // Sin el término tomado no se escribe: con los puntos cerrados siempre hay motivo, y si un día la
  // función dejara de darlo, esto falla cerrado.
  if (termClosed) {
    throw new DomainError(t("T-629"));
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
  const created = await transitionCheckIn(
    ctx,
    {
      occasion: row,
      personId: input.personId,
      current: null,
      to: status,
      source: "SELF_QR",
      booster: input.boosterId
        ? { id: input.boosterId, member: context.member ?? null }
        : undefined,
      now,
    },
    context,
  );
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
  context: { membership: MembershipRef | null; settings: GamificationSettings },
): Promise<{ checkInId: string; points: number }> {
  const now = input.now ?? new Date();
  const observed = await readOccasion(ctx, input.occasionId);
  if (!observed) {
    throw new DomainError(t("T-032"));
  }
  assertOpenForOrganizer(observed, input.source);
  if (!context.membership || !ELIGIBLE_STATUSES.includes(context.membership.status)) {
    throw new DomainError(t("T-673", { nombre: input.personName }));
  }
  if (observed.newMembersOnly && context.membership.firstTermId !== observed.termId) {
    throw new DomainError(t("T-674", { nombre: input.personName }));
  }
  await lockOpenTermPoints(ctx.tx, observed.termId);
  // ADR-119 regla 1: el estado que vale es el de la ocasión tomada.
  const row = await lockOccasion(ctx, observed);
  assertOpenForOrganizer(row, input.source);
  const [existing] = await lockCheckIns(ctx, ofPerson(row.id, input.personId));
  if (existing) {
    if (!canTransitionCheckIn(existing.status, "APPROVED")) {
      throw new DomainError(t("T-601", { nombre: input.personName }));
    }
    await decide(ctx, existing, row, "APPROVE", null, now, context.settings);
    return { checkInId: existing.id, points: row.points };
  }
  const created = await transitionCheckIn(
    ctx,
    {
      occasion: row,
      personId: input.personId,
      current: null,
      to: "APPROVED",
      source: input.source,
      now,
    },
    context,
  );
  return { checkInId: created.id, points: row.points };
}

// Decisiones sobre un check-in (aprobar, rechazar, anular).

/**
 * `current` llega de `lockCheckIns` y `row` de `lockOccasion`, con el término ya tomado: se valida
 * contra las dos filas retenidas.
 */
async function decide(
  ctx: CommandContext,
  current: CheckInRow,
  row: OccasionRow,
  decision: CheckInDecision,
  reason: string | null,
  now: Date,
  settings: GamificationSettings,
): Promise<void> {
  const target = statusForDecision(decision);
  if (!canTransitionCheckIn(current.status, target)) {
    throw new DomainError(t("T-676", { estado: checkInStatusLabel(current.status).toLowerCase() }));
  }
  const cleanReason = reason?.trim() || null;
  if (decision === "CANCEL" && !cleanReason) {
    throw new DomainError(t("T-609"), "reason");
  }
  // ADR-119 regla 1: en una ocasión cancelada ninguna asistencia vuelve a quedar aprobada. Rechazar
  // y anular siguen valiendo: solo cierran.
  if (target === "APPROVED" && row.status === "CANCELLED") {
    throw occasionStateError(row.status);
  }
  await transitionCheckIn(
    ctx,
    {
      occasion: row,
      personId: current.personId,
      current,
      to: target,
      reason: cleanReason,
      now,
    },
    { settings },
  );
}

export interface DecideInput {
  checkInId: string;
  /**
   * La ocasión desde cuya consola se decide (ADR-122 regla 1). Es obligatoria y el comando la
   * compara con la de la asistencia: la de otra ocasión responde igual que una que no existe.
   */
  occasionId: string;
  decision: CheckInDecision;
  reason?: string | null | undefined;
  /**
   * El estado que mostraba la fila a quien decide. Cuando viene, la fila tomada debe seguir en él
   * (ADR-116 regla 1): quien aprueba una pendiente que otro acaba de rechazar recibe el error de
   * transición en vez de reaprobarla sin enterarse. La consola lo manda siempre.
   */
  seenStatus?: CheckInStatus | undefined;
  now?: Date | undefined;
}

/**
 * Decide una asistencia por su id, desde la consola de su ocasión (ADR-122 regla 1). La primera
 * lectura va sin candado y solo dice de qué ocasión es, que no cambia: si no es la de la consola, la
 * decisión termina ahí, sin tomar nada de la otra ocasión. El estado de la ocasión y el de la
 * asistencia se leen con sus filas tomadas, después del término, y la ocasión se compara otra vez
 * con la fila tomada.
 */
export async function decideCheckIn(
  ctx: CommandContext,
  input: DecideInput,
  context: { settings: GamificationSettings },
): Promise<void> {
  const [found] = await ctx.tx
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .where(eq(checkIn.id, input.checkInId));
  // Falla cerrado: sin ocasión, o con una que no es la de la asistencia, no hay nada que decidir.
  const page: unknown = input.occasionId;
  if (!found || typeof page !== "string" || page === "" || found.occasionId !== page) {
    throw new DomainError(t("T-032"));
  }
  const observed = await readOccasion(ctx, found.occasionId);
  if (!observed) {
    throw new DomainError(t("T-032"));
  }
  await lockOpenTermPoints(ctx.tx, observed.termId);
  const row = await lockOccasion(ctx, observed);
  const [current] = await lockCheckIns(ctx, eq(checkIn.id, input.checkInId));
  if (!current || current.occasionId !== page) {
    throw new DomainError(t("T-032"));
  }
  if (input.seenStatus !== undefined && current.status !== input.seenStatus) {
    throw new DomainError(t("T-676", { estado: checkInStatusLabel(current.status).toLowerCase() }));
  }
  await decide(
    ctx,
    current,
    row,
    input.decision,
    input.reason ?? null,
    input.now ?? new Date(),
    context.settings,
  );
}

/** Anular no es una decisión de lote: solo se anula una asistencia aprobada, y el lote decide pendientes. */
export type BatchDecision = Exclude<CheckInDecision, "CANCEL">;

/**
 * Lote de la consola («Aprobar todos»). La lista llega leída antes de la transacción, así que el lote
 * decide con las filas tomadas cuáles siguen pendientes (ADR-116 regla 4): la que otra persona decidió
 * en el medio se deja como quedó, sin reaprobarla en silencio y sin tumbar a las demás.
 * Toma todas las filas de una vez, en el orden de id de `lockCheckIns`, antes de decidir ninguna
 * (regla 2): aprobar la primera encola el recálculo del puntaje de la ocasión, y quien decide otra
 * del lote desde su fila la tendría tomada y esperaría ese recálculo. Devuelve cuántas decidió.
 */
export async function decideMany(
  ctx: CommandContext,
  checkInIds: string[],
  decision: BatchDecision,
  reason: string | null | undefined,
  context: { settings: GamificationSettings },
): Promise<number> {
  const ids = [...new Set(checkInIds)];
  if (ids.length === 0) {
    return 0;
  }
  const now = new Date();
  // Lectura sin candado: solo dice de qué ocasión es cada asistencia, que no cambia.
  const found = await ctx.tx
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .where(inArray(checkIn.id, ids));
  if (found.length !== ids.length) {
    throw new DomainError(t("T-032"));
  }
  const occasions = new Map<string, OccasionRow>();
  for (const occasionId of new Set(found.map((item) => item.occasionId))) {
    const row = await readOccasion(ctx, occasionId);
    if (!row) {
      throw new DomainError(t("T-032"));
    }
    occasions.set(occasionId, row);
  }
  for (const termId of [...new Set([...occasions.values()].map((row) => row.termId))].sort()) {
    await lockOpenTermPoints(ctx.tx, termId);
  }
  // Las ocasiones, en orden de id y antes que sus asistencias (ADR-119 regla 1).
  for (const occasionId of [...occasions.keys()].sort()) {
    const observed = occasions.get(occasionId);
    if (observed) {
      occasions.set(occasionId, await lockOccasion(ctx, observed));
    }
  }
  const rows = await lockCheckIns(ctx, inArray(checkIn.id, ids));
  if (rows.length !== ids.length) {
    throw new DomainError(t("T-032"));
  }
  const pending = rows.filter((item) => item.status === "PENDING");
  for (const current of pending) {
    const row = occasions.get(current.occasionId);
    if (!row) {
      throw new DomainError(t("T-032"));
    }
    await decide(ctx, current, row, decision, reason ?? null, now, context.settings);
  }
  return pending.length;
}

/**
 * Al cancelar la ocasión: anula pendientes y aprobados, revierte los créditos vivos y avisa a cada
 * persona. `row` es la ocasión como estaba antes de cancelarla, con su fila tomada por `cancelOccasion`.
 */
export async function cancelOccasionCheckIns(
  ctx: CommandContext,
  row: OccasionRow,
  reason: string,
  context: { settings: GamificationSettings; now?: Date | undefined },
): Promise<number> {
  const now = context.now ?? new Date();
  await lockOpenTermPoints(ctx.tx, row.termId);
  // Se toman todas las de la ocasión y se filtra con la fila retenida: un rechazo que alguien está
  // reaprobando no estaba pendiente ni aprobado al mirar, y sin esperarlo quedaría vivo.
  const rows = (await lockCheckIns(ctx, eq(checkIn.occasionId, row.id))).filter((item) =>
    canCancelWithOccasion(item.status),
  );
  // Con todas tomadas, la primera que se anula encola el recálculo de la ocasión y las demás
  // encuentran su clave en cola: sale uno solo, después de las asistencias y antes del premio y del
  // reto, en el mismo lugar del orden de candados que en `decide`.
  for (const current of rows) {
    await transitionCheckIn(
      ctx,
      {
        occasion: row,
        personId: current.personId,
        current,
        to: "CANCELLED",
        reason,
        // Anular una pendiente es solo de este camino: la transición no lo admite sin la marca.
        occasionCancelled: true,
        now,
      },
      context,
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
  try {
    await transitionCheckIn(
      ctx,
      {
        occasion: row,
        personId: input.personId,
        current: current ?? null,
        to: "EXCUSED",
        // Quien excusa es GH: es el origen de la asistencia si nace y el que dice el evento.
        source: "ADMIN",
        reason,
        now,
      },
      context,
    );
  } catch (error) {
    // ADR-119 regla 2: un registro confirmó mientras la excusa creaba la asistencia. Responde lo
    // mismo que si la hubiera encontrado; la transacción quedó abortada y no se reintenta aquí.
    if (error instanceof AlreadyCheckedIn) {
      throw new DomainError(t("T-2223"));
    }
    throw error;
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

/** Cuántos check-ins tiene una ocasión en cada estado; el estado que no tiene ninguno queda en 0. */
export async function countCheckInsByStatus(
  occasionId: string,
): Promise<Record<CheckInStatus, number>> {
  const rows = await getDb()
    .select({ status: checkIn.status, total: sql<number>`count(*)::int` })
    .from(checkIn)
    .where(eq(checkIn.occasionId, occasionId))
    .groupBy(checkIn.status);
  const counts = Object.fromEntries(CHECK_IN_STATUSES.map((status) => [status, 0])) as Record<
    CheckInStatus,
    number
  >;
  for (const row of rows) {
    counts[row.status] = row.total;
  }
  return counts;
}

export type RecentCheckIn = Pick<CheckInRow, "id" | "personId" | "at" | "source" | "status">;

/**
 * Los últimos check-ins de una ocasión, del más reciente al más viejo, con lo que la consola en vivo
 * muestra de cada uno: sin el motivo ni quién lo decidió.
 */
export async function listRecentCheckIns(
  occasionId: string,
  limit: number,
): Promise<RecentCheckIn[]> {
  return getDb()
    .select({
      id: checkIn.id,
      personId: checkIn.personId,
      at: checkIn.at,
      source: checkIn.source,
      status: checkIn.status,
    })
    .from(checkIn)
    .where(eq(checkIn.occasionId, occasionId))
    .orderBy(desc(checkIn.at))
    .limit(limit);
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
