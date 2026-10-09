import { eq, sql } from "drizzle-orm";
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
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { checkIn } from "../schema";
import { type BoosterRow, setBoosterTarget } from "./boosters";
import { applyPresentialCheckIn } from "./challenge-participation";
import { CHECK_IN_STATUSES, type CheckInSource, type CheckInStatus } from "./check-in-pure";
import { applyCheckInBoost, type CheckInBoostOutcome } from "./checkin-boost";
import { creditCheckIn, reverseCheckInCredit } from "./ledger";
import type { GamificationSettings, MemberContext } from "./member-context";
import type { OccasionRow } from "./occasions";

// Una asistencia cambia de estado por aquí y solo por aquí (ADR-119 regla 4). Los cinco caminos de
// check-ins.ts (registro propio, organizador, decidir, cancelar la ocasión y excusa) validan sus
// condiciones de entrada, toman sus candados y llaman a `transitionCheckIn`, que aplica todo lo
// demás en un orden fijo: la fila, el libro de puntos, la auditoría, los eventos, el booster elegido
// y los dos ganchos del premio. Qué efecto tiene cada estado de destino lo dice una sola tabla.
//
// Es un módulo interno con una sola implementación (ADR-109 regla 11), no una costura: quien llama
// no sabe de créditos ni de ganchos, y nadie más que check-ins.ts lo usa.

// El tipo sale del schema y no de check-ins.ts: ese módulo importa este.
type CheckInRow = typeof checkIn.$inferSelect;
type Emitted = Parameters<CommandContext["emit"]>[0];

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

/**
 * Señal para el wrapper: el booster elegido en el registro no vale. La asistencia ya estaba escrita
 * (ADR-119 regla 3), así que la transacción se deshace entera y el wrapper responde `BOOSTER`.
 */
export class BoosterDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoosterDenied";
  }
}

export function statusLabel(status: CheckInStatus): string {
  return tList("T-597")[CHECK_IN_STATUSES.indexOf(status)] ?? status;
}

function facts(row: OccasionRow, personId: string, source: string) {
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

type Facts = ReturnType<typeof facts>;

/** Lo que le pasa a todo lo demás cuando una asistencia llega a un estado. */
interface Effects {
  /** El libro de puntos: acredita los puntos de la ocasión, revierte el crédito vivo o no lo toca. */
  ledger: "CREDIT" | "REVERSE" | "NONE";
  /** El aviso que sale por el outbox. El rechazo no avisa. */
  event: ((facts: Facts, reason: string | null) => Emitted) | null;
  /** Si pide el recálculo del puntaje de la ocasión. Solo sale cuando la ocasión da puntos. */
  recompute: boolean;
  /** El desenlace que reciben los dos ganchos del premio (ADR-067 reglas 8 y 12). */
  hook: CheckInBoostOutcome;
  /**
   * Motivos propios con que los ganchos cierran el premio y la entrega del reto. Sin ellos reciben el
   * motivo del cambio. Los trae la excusa (ADR-111 regla 3): su motivo es texto de la persona y no se
   * copia a otra tabla.
   */
  hookReasons: ((occasion: OccasionRow) => { reason: string; rejectionReason: string }) | null;
  /** La acción con que se audita. Una pendiente solo nace, y nacer se audita como `checkin.created`. */
  action: string | null;
  /** Si la auditoría dice cuántos puntos se revirtieron: las decisiones de la consola sí, la excusa no. */
  auditsReversal: boolean;
}

const EFFECTS: Record<CheckInStatus, Effects> = {
  PENDING: {
    ledger: "NONE",
    event: (payload) => eventOf(checkinPending, payload),
    recompute: false,
    hook: "PENDING",
    hookReasons: null,
    action: null,
    auditsReversal: false,
  },
  APPROVED: {
    ledger: "CREDIT",
    event: (payload) => eventOf(checkinApproved, payload),
    recompute: true,
    hook: "APPROVED",
    hookReasons: null,
    action: "checkin.approve",
    auditsReversal: true,
  },
  REJECTED: {
    ledger: "NONE",
    event: null,
    recompute: false,
    hook: "REJECTED",
    hookReasons: null,
    action: "checkin.reject",
    auditsReversal: true,
  },
  CANCELLED: {
    ledger: "REVERSE",
    event: (payload, reason) => eventOf(checkinCancelled, { ...payload, reason }),
    recompute: true,
    hook: "CANCELLED",
    hookReasons: null,
    action: "checkin.cancel",
    auditsReversal: true,
  },
  // ADR-067 regla 3 y ADR-111: la excusa cierra la asistencia sin aprobarla, así que con el premio
  // hace lo mismo que un rechazo. El motivo del premio es el estado y el de la entrega dice que la
  // asistencia quedó excusada.
  EXCUSED: {
    ledger: "NONE",
    event: (payload, reason) => eventOf(checkinExcused, { ...payload, reason }),
    recompute: false,
    hook: "REJECTED",
    hookReasons: (occasion) => ({
      reason: statusLabel("EXCUSED"),
      rejectionReason: t("T-3205", { actividad: occasion.title }),
    }),
    action: "checkin.excused",
    auditsReversal: false,
  },
};

export interface CheckInChange {
  occasion: OccasionRow;
  personId: string;
  /** La asistencia tomada con su candado (`lockCheckIns`), o `null` si la persona no tenía y nace. */
  current: CheckInRow | null;
  to: CheckInStatus;
  /**
   * De dónde viene el cambio. Es el origen de la asistencia que nace; en una que ya existe solo lo
   * manda la excusa, y es el que dice su evento. Sin él, el evento lleva el origen de la fila.
   */
  source?: CheckInSource | undefined;
  /** El motivo ya limpio, como queda en la fila, la auditoría y el evento. */
  reason?: string | null | undefined;
  /** Booster que la persona elige en su propio registro (ADR-067 regla 8). */
  booster?: { id: string; member: MemberContext | null } | undefined;
  /**
   * Diferencias de hoy que la matriz de caracterización fija: cancelar la ocasión no audita cada
   * asistencia y la excusa audita con «ocasión:persona».
   */
  audit?: "CHECK_IN" | "OCCASION_PERSON" | "NONE" | undefined;
  now: Date;
}

/**
 * Lleva una asistencia a su estado de destino con todos sus efectos. No valida la transición ni toma
 * la asistencia: eso es de cada camino. La configuración es obligatoria: sin ella los ganchos no
 * sabrían si liberar o confirmar lo reservado. Devuelve la asistencia como quedó.
 *
 * El orden es el de los candados (ADR-116 regla 2, ADR-119 regla 3): la fila, el recálculo encolado
 * y recién después el premio de la persona y el reto presencial.
 */
export async function transitionCheckIn(
  ctx: CommandContext,
  change: CheckInChange,
  context: { settings: GamificationSettings },
): Promise<CheckInRow> {
  const { occasion, personId, current, to, now } = change;
  const effects = EFFECTS[to];
  const reason = change.reason ?? null;
  const source = change.source ?? current?.source;
  if (!source) {
    throw new Error("Una asistencia que nace necesita su origen");
  }
  const row = current
    ? await rewrite(ctx, current, to, reason, now)
    : await insert(ctx, { occasion, personId, to, source, reason, now });

  let reversed = 0;
  if (effects.ledger === "CREDIT") {
    await creditCheckIn(ctx, {
      checkInId: row.id,
      personId,
      termId: occasion.termId,
      points: occasion.points,
      reason: occasion.title,
    });
  } else if (effects.ledger === "REVERSE") {
    reversed = await reverseCheckInCredit(ctx, row.id, reason ?? "");
  }

  // La que nace viva (aprobada o pendiente) se audita como creada, con de dónde vino. Todo lo demás
  // es una decisión sobre la asistencia, también la excusa que la crea ya excusada.
  const born = !current && to !== "EXCUSED";
  const audit = change.audit ?? "CHECK_IN";
  if (born) {
    await ctx.audit({
      action: "checkin.created",
      entityType: "check_in",
      entityId: row.id,
      after: { occasionId: occasion.id, personId, status: to, source },
    });
  } else if (audit !== "NONE") {
    if (!effects.action) {
      throw new Error(`Una asistencia que ya existe no pasa a ${to}`);
    }
    await ctx.audit({
      action: effects.action,
      entityType: "check_in",
      entityId: audit === "OCCASION_PERSON" ? `${occasion.id}:${personId}` : row.id,
      before: current ? { status: current.status } : null,
      after: effects.auditsReversal ? { status: to, reason, reversed } : { status: to, reason },
    });
  }

  if (effects.event) {
    await ctx.emit(effects.event(facts(occasion, personId, source), reason));
  }
  if (effects.recompute && occasion.points > 0) {
    await ctx.emit(
      eventOf(scoreRecompute, { occasionId: occasion.id }, { dedupeKey: `score:${occasion.id}` }),
    );
  }

  // ADR-119 regla 3: el premio de la persona y el booster que eligió se toman aquí, con la asistencia
  // ya escrita y el recálculo encolado. Si el booster no vale, la señal deshace la transacción.
  let selectedBooster: BoosterRow | undefined;
  if (change.booster) {
    // Mismo orden que reserveReward: persona antes que booster, también en carreras con trivia.
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${personId}`}, 0))`,
    );
    try {
      selectedBooster = await setBoosterTarget(
        ctx,
        {
          personId,
          boosterId: change.booster.id,
          target: { occasionId: occasion.id },
          now,
          allowUnavailable: true,
          forCheckInId: row.id,
        },
        { member: change.booster.member, settings: context.settings },
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BoosterDenied(error.message);
      }
      throw error;
    }
  }

  // ADR-067 reglas 8 y 12: el booster de la ocasión se resuelve antes que el reto presencial. La que
  // nace excusada no tenía nada reservado y no pasa por los ganchos.
  if (current || to !== "EXCUSED") {
    const own = effects.hookReasons?.(occasion);
    const hookReason = own ? own.reason : reason;
    await applyCheckInBoost(
      ctx,
      { checkIn: row, occasion, outcome: effects.hook, selectedBooster, reason: hookReason, now },
      context,
    );
    await applyPresentialCheckIn(
      ctx,
      {
        checkIn: row,
        occasion,
        outcome: effects.hook,
        reason: hookReason,
        rejectionReason: own?.rejectionReason,
        now,
      },
      context,
    );
  }
  return row;
}

async function rewrite(
  ctx: CommandContext,
  current: CheckInRow,
  to: CheckInStatus,
  reason: string | null,
  now: Date,
): Promise<CheckInRow> {
  await ctx.tx
    .update(checkIn)
    .set({ status: to, decidedById: ctx.actor.personId, decidedAt: now, reason })
    .where(eq(checkIn.id, current.id));
  return { ...current, status: to };
}

async function insert(
  ctx: CommandContext,
  born: {
    occasion: OccasionRow;
    personId: string;
    to: CheckInStatus;
    source: CheckInSource;
    reason: string | null;
    now: Date;
  },
): Promise<CheckInRow> {
  try {
    const [created] = await ctx.tx
      .insert(checkIn)
      .values({
        occasionId: born.occasion.id,
        personId: born.personId,
        status: born.to,
        source: born.source,
        at: born.now,
        // El registro propio lo decide la regla de la ocasión, no una persona; el organizador y la
        // excusa los decide quien actúa. Una pendiente todavía no tiene decisión.
        decidedById: born.source === "SELF_QR" ? null : ctx.actor.personId,
        decidedAt: born.to === "PENDING" ? null : born.now,
        reason: born.reason,
      })
      .returning();
    if (!created) {
      throw new Error("No se pudo registrar el check-in");
    }
    return created;
  } catch (error) {
    if (isUniqueViolation(error, "check_in_occasion_person_unique")) {
      // La transacción quedó abortada: quien llama decide qué responder afuera.
      throw new AlreadyCheckedIn(born.occasion.id, born.personId);
    }
    throw error;
  }
}
