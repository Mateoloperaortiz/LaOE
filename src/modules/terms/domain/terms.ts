import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { term } from "../schema";

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

/** El término de hoy en Bogotá (ADR-004), o null si ninguno lo contiene. */
export async function getCurrentTerm(
  now = new Date(),
  exec: Executor = getDb(),
): Promise<TermRow | null> {
  return findTermContaining(todayKey(now), exec);
}

export async function findTermByCode(code: string): Promise<TermRow | null> {
  const [row] = await getDb().select().from(term).where(eq(term.code, code)).limit(1);
  return row ?? null;
}

/** Todos los términos, del más reciente al más viejo (para selectores). */
export async function listAllTerms(): Promise<TermRow[]> {
  return getDb().select().from(term).orderBy(desc(term.startsOn));
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

export async function createTerm(ctx: CommandContext, input: TermInput): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx.insert(term).values(toValues(input)).returning({ id: term.id });
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
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
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

/** Estampa el cierre de puntos (ADR-004): desde ahí el ledger del término no acepta entradas. Sin reapertura. */
export async function closeTermPoints(
  ctx: CommandContext,
  id: string,
  at = new Date(),
): Promise<TermRow> {
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id));
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

/** Estampa el cierre de permanencia (ADR-036 regla 9): exige los puntos cerrados; sin reapertura. */
export async function closeTermPermanence(
  ctx: CommandContext,
  id: string,
  at = new Date(),
): Promise<TermRow> {
  const [before] = await ctx.tx.select().from(term).where(eq(term.id, id));
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
