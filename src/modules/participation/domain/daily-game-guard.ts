import { sql } from "drizzle-orm";
import type { CommandContext, Executor } from "@/db/tx";
import { getMembershipRef } from "@/modules/people";
import { findTermContaining, getTerm, lockOpenTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/lib/errors";
import { dayKeyFor } from "./gamification-pure";

// La guardia de la partida diaria (ADR-119 regla 7): el día, el término, su candado, el candado
// propio del juego, la elegibilidad y el vencimiento, en un solo lugar para el Wordle, el 2048, el
// Sudoku y el Panal. Cada juego conserva su tabla, sus reglas y su vista. Es un módulo interno: no
// sale por `index.ts`.

type TermRow = NonNullable<Awaited<ReturnType<typeof findTermContaining>>>;

/** Las razones con que la guardia rechaza. Se llaman igual en los cuatro juegos. */
export type DailyGameRefusal = "NO_TERM" | "EXPIRED" | "NOT_ELIGIBLE" | "TERM_CLOSED";
type ContinueRefusal = Exclude<DailyGameRefusal, "NO_TERM">;

/**
 * Lo que un juego le declara a la guardia. El candado es un dato del juego. Los otros tres campos
 * son conductas que hoy no son iguales entre los juegos y que ninguna ADR decidió: se conservan
 * declaradas aquí, con su prueba (`tests/integration/game-daily-guard.test.ts`), hasta que se
 * cierren las decisiones abiertas 49 y 50.
 */
export interface DailyGameRules {
  /**
   * El candado consultivo propio, con la clave `<key>:<persona o día>`. `PERSON` serializa las
   * partidas de una persona, al empezar y al seguir. `DAY` serializa el reparto del día entre todas
   * las personas (las respuestas únicas del Wordle) y solo se toma al empezar.
   */
  lock:
    | { key: "wordle-day"; per: "DAY" }
    | { key: "game2048" | "sudoku" | "panal" | "color"; per: "PERSON" };
  /**
   * Empezar con el semestre cerrado (decisión abierta 49). `REFUSE` responde TERM_CLOSED sin mirar
   * la partida guardada. `SAVED_FIRST` sigue con `open` en falso: el juego devuelve la partida
   * guardada si la hay y responde TERM_CLOSED él mismo si no.
   */
  startWhenClosed: "REFUSE" | "SAVED_FIRST";
  /** Seguir con el día vencido y el semestre cerrado a la vez: la razón que gana (decisión 50). */
  expiredAndClosed: "EXPIRED" | "TERM_CLOSED";
  /** Seguir hoy, con los puntos abiertos, cuando hoy ya no cae en el término de la partida (decisión 50). */
  movedTerm: ContinueRefusal;
}

export type DailyGameStart =
  | { ok: false; reason: DailyGameRefusal }
  | { ok: true; day: string; term: TermRow; open: boolean; now: Date };

/** Activos y honorarios (ADR-075 regla 12). Se relee en cada comando: no se confía en el actor. */
export async function isEligibleToPlay(personId: string, exec: Executor): Promise<boolean> {
  const membership = await getMembershipRef(personId, exec);
  return membership?.status === "ACTIVE" || membership?.status === "HONORARY";
}

/**
 * Toma el término compartido (ADR-041 regla 7) y dice si sus puntos siguen abiertos. Mantiene el
 * `FOR SHARE` aun cuando el semestre ya cerró, para poder reconocer reintentos.
 */
async function lockTerm(ctx: CommandContext, termId: string): Promise<boolean> {
  try {
    await lockOpenTermPoints(ctx.tx, termId);
    return true;
  } catch (error) {
    if (error instanceof DomainError && (await getTerm(termId, ctx.tx))?.pointsClosedAt) {
      return false;
    }
    throw error;
  }
}

async function lockOwn(ctx: CommandContext, key: string, subject: string): Promise<void> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${key}:${subject}`}, 0))`,
  );
}

/**
 * Para empezar la partida de hoy. Orden fijo: día → término que lo contiene (sin él, NO_TERM) →
 * candado del término → candado propio → reloj otra vez (si los candados esperaron y el día
 * cambió, o la pantalla pedía otro día, EXPIRED) → elegibilidad (NOT_ELIGIBLE) → cierre. El
 * reloj llega como función porque se lee dos veces. Quien sigue recibe el día, el término, si sus
 * puntos están abiertos y el instante leído con los candados tomados.
 */
export async function startDailyGame(
  ctx: CommandContext,
  rules: DailyGameRules,
  input: {
    personId: string;
    now: () => Date;
    /** El día que la pantalla mostraba, si el juego lo manda (el Panal); `null` si no. */
    expectedDay: string | null;
  },
): Promise<DailyGameStart> {
  const day = dayKeyFor(input.now());
  const current = await findTermContaining(day, ctx.tx);
  if (!current) {
    return { ok: false, reason: "NO_TERM" };
  }
  const open = await lockTerm(ctx, current.id);
  await lockOwn(ctx, rules.lock.key, rules.lock.per === "DAY" ? day : input.personId);
  const now = input.now();
  if (dayKeyFor(now) !== day || (input.expectedDay !== null && input.expectedDay !== day)) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (!(await isEligibleToPlay(input.personId, ctx.tx))) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }
  if (!open && rules.startWhenClosed === "REFUSE") {
    return { ok: false, reason: "TERM_CLOSED" };
  }
  return { ok: true, day, term: current, open, now };
}

/**
 * Para seguir o cerrar una partida guardada: toma el término de la partida y después el candado
 * propio, y dice si los puntos del término siguen abiertos. El juego lee su fila después.
 */
export async function lockDailyGame(
  ctx: CommandContext,
  rules: DailyGameRules,
  input: { personId: string; termId: string },
): Promise<boolean> {
  const open = await lockTerm(ctx, input.termId);
  if (rules.lock.per === "PERSON") {
    await lockOwn(ctx, rules.lock.key, input.personId);
  }
  return open;
}

/** Solo el candado propio, para el comando que no escribe nada que el cierre congele (abandonar). */
export async function lockDailyGamePerson(
  ctx: CommandContext,
  rules: DailyGameRules & { lock: { per: "PERSON" } },
  personId: string,
): Promise<void> {
  await lockOwn(ctx, rules.lock.key, personId);
}

/**
 * Con la partida ya tomada: por qué no puede seguir, o `null` si puede. Mira que su día sea hoy,
 * que los puntos sigan abiertos, que hoy caiga en su término y que la persona siga elegible. El
 * instante lo trae el juego: cuándo lo lee es conducta suya (decisión abierta 50).
 */
export async function refusalToContinue(
  ctx: CommandContext,
  rules: DailyGameRules,
  input: { personId: string; game: { day: string; termId: string }; open: boolean; now: Date },
): Promise<ContinueRefusal | null> {
  const today = dayKeyFor(input.now);
  const closedWins = !input.open && rules.expiredAndClosed === "TERM_CLOSED";
  if (input.game.day !== today && !closedWins) {
    return "EXPIRED";
  }
  if (!input.open) {
    return "TERM_CLOSED";
  }
  if ((await findTermContaining(today, ctx.tx))?.id !== input.game.termId) {
    return rules.movedTerm;
  }
  if (!(await isEligibleToPlay(input.personId, ctx.tx))) {
    return "NOT_ELIGIBLE";
  }
  return null;
}
