import { and, asc, count, desc, eq, gte, ilike, lte, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor, Tx } from "@/db/tx";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { pointSeparationPolicy, term } from "../schema";

// El término es el reloj universal (ADR-004): el actual se deriva de la fecha; el cierre de puntos es explícito.

export type TermRow = typeof term.$inferSelect;

export const TERM_CODE = /^\d{4}-[12]$/;

export function semesterFromCode(code: string): 1 | 2 {
  return code.endsWith("-2") ? 2 : 1;
}

export const termInputSchema = z
  .object({
    code: z.string().trim().regex(TERM_CODE),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    requiredOrdinaryAssemblies: z.coerce.number().int().min(0).max(10).default(1),
    permanenceGeneralNominal: z.coerce.number().int().min(0).max(1000).default(50),
    permanenceCommitteeNominal: z.coerce.number().int().min(0).max(1000).default(60),
  })
  .refine((input) => input.startsOn < input.endsOn, { path: ["endsOn"], message: t("T-298") });

export type TermInput = z.infer<typeof termInputSchema>;

export interface TermListParams {
  q: string;
  page: number;
  pageSize: number;
}

export async function listTerms(
  params: TermListParams,
): Promise<{ rows: TermRow[]; total: number }> {
  const where = params.q ? ilike(term.code, `%${params.q}%`) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(term)
      .where(where)
      .orderBy(desc(term.startsOn))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(term).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getTerm(id: string, exec: Executor = getDb()): Promise<TermRow | null> {
  const [row] = await exec.select().from(term).where(eq(term.id, id)).limit(1);
  return row ?? null;
}

/** El término que contiene una fecha (YYYY-MM-DD en Bogotá), o null si no hay. */
export async function findTermContaining(
  date: string,
  exec: Executor = getDb(),
): Promise<TermRow | null> {
  const [row] = await exec
    .select()
    .from(term)
    .where(and(lte(term.startsOn, date), gte(term.endsOn, date)))
    .orderBy(asc(term.startsOn))
    .limit(1);
  return row ?? null;
}

/**
 * El término que contiene un día, leído por el pool y compartido dentro de un render de servidor
 * (ADR-121 regla 11): el layout, la página y el título de un mismo request preguntan por el término
 * de hoy cada uno por su lado. La clave es el día, un texto, así que dos llamadas del mismo render
 * coinciden aunque cada una arme su propia fecha. Fuera de un render (un trabajo, un script, una
 * action antes de volver a pintar, una prueba) `cache` no guarda nada y cada llamada consulta.
 */
const termContainingForRender = cache((date: string) => findTermContaining(date));

/** El término de hoy en Bogotá (ADR-004), o null si ninguno lo contiene. */
export async function getCurrentTerm(now = new Date(), exec?: Executor): Promise<TermRow | null> {
  const date = todayKey(now);
  // Una transacción lee por su conexión y ve lo que ella misma escribió: eso no se comparte.
  return exec === undefined || exec === getDb()
    ? termContainingForRender(date)
    : findTermContaining(date, exec);
}

export async function findTermByCode(code: string): Promise<TermRow | null> {
  const [row] = await getDb().select().from(term).where(eq(term.code, code)).limit(1);
  return row ?? null;
}

/** Todos los términos, del más reciente al más viejo (para selectores). */
export async function listAllTerms(exec: Executor = getDb()): Promise<TermRow[]> {
  return exec.select().from(term).orderBy(desc(term.startsOn));
}

/** Fechas convencionales de un término que no existe: semestre 1 de enero a junio, 2 de julio a diciembre (ADR-034). */
export function conventionalTermDates(code: string): { startsOn: string; endsOn: string } {
  const year = code.slice(0, 4);
  return semesterFromCode(code) === 1
    ? { startsOn: `${year}-01-01`, endsOn: `${year}-06-30` }
    : { startsOn: `${year}-07-01`, endsOn: `${year}-12-31` };
}

function toValues(input: TermInput) {
  return {
    code: input.code,
    semester: semesterFromCode(input.code),
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    requiredOrdinaryAssemblies: input.requiredOrdinaryAssemblies,
    permanenceGeneralNominal: input.permanenceGeneralNominal,
    permanenceCommitteeNominal: input.permanenceCommitteeNominal,
  };
}

/**
 * El candado del calendario de términos (ADR-118 regla 26): crear y editar comprueban el solape y
 * escriben con él tomado, así que dos altas a la vez no dejan un mismo día en dos términos. Va antes
 * que la fila de cualquier término y dura hasta que termina la transacción.
 */
async function lockTermCalendar(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('term-calendar', 0))`);
}

/**
 * Rechaza las fechas que comparten algún día con otro término; los dos extremos cuentan. Se llama con
 * el candado del calendario tomado. El término con el mismo código no entra: ese choque lo dice el
 * índice único con su propio texto (T-293).
 */
async function assertNoOverlap(tx: Tx, input: TermInput, ownId: string | null): Promise<void> {
  const [other] = await tx
    .select({ code: term.code })
    .from(term)
    .where(
      and(
        lte(term.startsOn, input.endsOn),
        gte(term.endsOn, input.startsOn),
        ne(term.code, input.code),
        ownId ? ne(term.id, ownId) : undefined,
      ),
    )
    .orderBy(asc(term.startsOn))
    .limit(1);
  if (other) {
    throw new DomainError(t("T-3254", { término: other.code }), "startsOn");
  }
}

export async function createTerm(ctx: CommandContext, input: TermInput): Promise<{ id: string }> {
  await lockTermCalendar(ctx.tx);
  await assertNoOverlap(ctx.tx, input, null);
  const [policy] = await ctx.tx
    .select()
    .from(pointSeparationPolicy)
    .where(eq(pointSeparationPolicy.id, "GH_GAMER"));
  if (!policy) throw new Error("Falta la frontera de separación de GH Points y Juegos");
  try {
    const [row] = await ctx.tx
      .insert(term)
      .values({ ...toValues(input), gamePointsSeparated: input.code >= policy.firstTermCode })
      .returning({ id: term.id });
    if (!row) {
      throw new Error("No se pudo crear el término");
    }
    await ctx.audit({
      action: "term.created",
      entityType: "term",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "term_code_unique")) {
      throw new DomainError(t("T-293"), "code");
    }
    throw error;
  }
}

export async function updateTerm(ctx: CommandContext, id: string, input: TermInput): Promise<void> {
  await lockTermCalendar(ctx.tx);
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await assertNoOverlap(ctx.tx, input, id);
  const values = toValues(input);
  try {
    await ctx.tx.update(term).set(values).where(eq(term.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "term_code_unique")) {
      throw new DomainError(t("T-293"), "code");
    }
    throw error;
  }
  await ctx.audit({
    action: "term.updated",
    entityType: "term",
    entityId: id,
    before,
    after: values,
  });
}

/** El código del término siguiente: 2026-1 → 2026-2, 2026-2 → 2027-1. */
export function nextTermCode(code: string): string {
  const year = Number.parseInt(code.slice(0, 4), 10);
  return semesterFromCode(code) === 1 ? `${year}-2` : `${year + 1}-1`;
}

/**
 * Devuelve el término siguiente al dado y lo crea con fechas convencionales si falta (cierre de
 * permanencia, ADR-036; transferencias aprobadas, ADR-037). Hereda asambleas y nominales del actual.
 */
export async function ensureNextTerm(
  ctx: CommandContext,
  current: TermRow,
): Promise<{ id: string; code: string; created: boolean }> {
  const code = nextTermCode(current.code);
  const [existing] = await ctx.tx
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, code))
    .limit(1);
  if (existing) {
    return { id: existing.id, code, created: false };
  }
  const created = await createTerm(ctx, {
    code,
    ...conventionalTermDates(code),
    requiredOrdinaryAssemblies: current.requiredOrdinaryAssemblies,
    permanenceGeneralNominal: current.permanenceGeneralNominal,
    permanenceCommitteeNominal: current.permanenceCommitteeNominal,
  });
  return { id: created.id, code, created: true };
}

/**
 * Barrera del término sin exigir puntos abiertos: una excusa tardía espera la foto del cierre,
 * pero sigue admitida después. Se toma antes de ocasión/persona/asistencias/premios.
 */
export async function lockTermPoints(
  tx: Tx,
  termId: string,
  mode: "shared" | "exclusive" = "shared",
): Promise<TermRow> {
  const [row] = await tx
    .select()
    .from(term)
    .where(eq(term.id, termId))
    .for(mode === "shared" ? "share" : "update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/**
 * Los escritores de una persona corren juntos. Un lote de personas y el cierre toman exclusividad
 * desde su primer candado: nunca ascienden después de retener un reward de su subconjunto.
 */
export async function lockOpenTermPoints(
  tx: Tx,
  termId: string,
  mode: "shared" | "exclusive" = "shared",
): Promise<TermRow> {
  const row = await lockTermPoints(tx, termId, mode);
  if (row.pointsClosedAt) {
    throw new DomainError(t("T-629"));
  }
  return row;
}

/** Reserva el cierre antes de liquidar sus premios pendientes, sin estampar todavía el término. */
export async function lockOpenTermForClosing(tx: Tx, termId: string): Promise<TermRow> {
  return lockOpenTermPoints(tx, termId, "exclusive");
}

/** Estampa el cierre de puntos (ADR-004): desde ahí el ledger del término no acepta entradas. Sin reapertura. */
export async function closeTermPoints(
  ctx: CommandContext,
  id: string,
  at = new Date(),
): Promise<TermRow> {
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id)).for("update");
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.pointsClosedAt) {
    throw new DomainError(t("T-629"));
  }
  await ctx.tx.update(term).set({ pointsClosedAt: at }).where(eq(term.id, id));
  await ctx.audit({
    action: "term.points-closed",
    entityType: "term",
    entityId: id,
    before: { pointsClosedAt: null },
    after: { pointsClosedAt: at.toISOString() },
  });
  return { ...before, pointsClosedAt: at };
}

/**
 * Estampa el cierre de permanencia (ADR-036 regla 9): exige los puntos cerrados; sin reapertura. Toma
 * la fila del término antes de leerla, como el cierre de puntos: un segundo cierre espera y recibe
 * T-808 (ADR-118 regla 27).
 */
export async function closeTermPermanence(
  ctx: CommandContext,
  id: string,
  at = new Date(),
): Promise<TermRow> {
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id)).for("update");
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (!before.pointsClosedAt) {
    throw new DomainError(t("T-799", { término: before.code }));
  }
  if (before.permanenceClosedAt) {
    throw new DomainError(
      t("T-808", { término: before.code, fecha: before.permanenceClosedAt.toISOString() }),
    );
  }
  await ctx.tx.update(term).set({ permanenceClosedAt: at }).where(eq(term.id, id));
  await ctx.audit({
    action: "term.permanence-closed",
    entityType: "term",
    entityId: id,
    before: { permanenceClosedAt: null },
    after: { permanenceClosedAt: at.toISOString() },
  });
  return { ...before, permanenceClosedAt: at };
}
