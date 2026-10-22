import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { occasionClosed, scoreRecompute } from "@/domain-events/participation";
import { lockOpenTermPoints } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { occasion } from "../schema";
import { lockParticipationBatch } from "./batch-lock";
import {
  canOpenOccasion,
  canTransitionOccasion,
  defaultWindow,
  OCCASION_STATUSES,
  type OccasionStatus,
  type WindowConfig,
} from "./occasion-pure";
import { newPublicId } from "./public-id-pure";
import { newRotatingSecret } from "./rotating-code-pure";

// Ocasiones (ADR-006, ADR-035): ciclo DRAFT → OPEN → CLOSED, CANCELLED con motivo; fuera de borrador
// solo cambian título, descripción y lugar. Las lecturas cruzadas (término, comités, ediciones) se
// resuelven fuera de la transacción: aquí solo se tocan tablas propias.

export type OccasionRow = typeof occasion.$inferSelect;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_INPUT, { message: t("T-298") });

export const occasionInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    kind: z.enum(["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"]).default("ACTIVITY"),
    assemblyKind: z.enum(["ORDINARY", "BOARD_ELECTION", "RUNOFF"]).optional(),
    category: z
      .enum([
        "INTEGRATION",
        "ATHLETIC_MATCH",
        "COMMITTEE_MEETING",
        "TALK",
        "WORKSHOP",
        "SOCIAL",
        "OTHER",
      ])
      .default("OTHER"),
    newMembersOnly: z.boolean().default(false),
    description: z.string().max(20_000).default(""),
    location: z.string().trim().max(200).default(""),
    startsAt: localDateTime.transform(bogotaInputToUtc),
    endsAt: localDateTime.transform(bogotaInputToUtc).optional(),
    checkInOpensAt: localDateTime.transform(bogotaInputToUtc).optional(),
    checkInClosesAt: localDateTime.transform(bogotaInputToUtc).optional(),
    points: z.coerce.number().int().min(0).max(1000).default(0),
    approval: z.enum(["AUTO", "MANUAL"]).default("AUTO"),
    requireRotatingCode: z.boolean().default(false),
    committeeId: z.string().trim().min(1).optional(),
    editionId: z.string().trim().min(1).optional(),
    /** Encuesta al cerrar (ADR-038 regla 13): un formulario de miembros que no crea personas. */
    surveyFormId: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().trim().min(1).optional(),
    ),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "ASSEMBLY" && input.assemblyKind === undefined) {
      ctx.addIssue({ code: "custom", path: ["assemblyKind"], message: t("T-573") });
    }
    if (input.kind === "ASSEMBLY" && input.points !== 0) {
      ctx.addIssue({ code: "custom", path: ["points"], message: t("T-572") });
    }
    if (input.kind === "EDITION_SESSION" && input.editionId === undefined) {
      ctx.addIssue({ code: "custom", path: ["editionId"], message: t("T-574") });
    }
    if (input.endsAt !== undefined && input.endsAt <= input.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: t("T-298") });
    }
    if (
      input.checkInOpensAt !== undefined &&
      input.checkInClosesAt !== undefined &&
      input.checkInClosesAt <= input.checkInOpensAt
    ) {
      ctx.addIssue({ code: "custom", path: ["checkInClosesAt"], message: t("T-575") });
    }
  });

export type OccasionInput = z.infer<typeof occasionInputSchema>;

/** Lo que el wrapper resuelve antes de la transacción: término de la fecha y ventana por defecto. */
export interface OccasionContext {
  termId: string;
  window: WindowConfig;
}

/**
 * El error de «esa acción no aplica» (T-578), con el estado de la ocasión como lo nombra la interfaz
 * (T-568) y en minúscula: «la ocasión está cancelada». Lo responden abrir, cerrar y cancelar, y
 * registrar o decidir una asistencia (check-ins.ts): es el único sitio que arma ese texto.
 */
export function occasionStateError(status: OccasionStatus): DomainError {
  const label = tLabels("T-568", OCCASION_STATUSES)[status] ?? status;
  return new DomainError(t("T-578", { estado: label.toLowerCase() }));
}

function toValues(input: OccasionInput, context: OccasionContext) {
  const window = defaultWindow(input.startsAt, context.window);
  return {
    termId: context.termId,
    title: input.title,
    kind: input.kind,
    assemblyKind: input.kind === "ASSEMBLY" ? (input.assemblyKind ?? null) : null,
    category: input.category,
    newMembersOnly: input.newMembersOnly,
    description: input.description,
    location: input.location,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    checkInOpensAt: input.checkInOpensAt ?? window.checkInOpensAt,
    checkInClosesAt: input.checkInClosesAt ?? window.checkInClosesAt,
    points: input.kind === "ASSEMBLY" ? 0 : input.points,
    approval: input.approval,
    requireRotatingCode: input.requireRotatingCode,
    committeeId: input.committeeId ?? null,
    editionId: input.kind === "EDITION_SESSION" ? (input.editionId ?? null) : null,
    surveyFormId: input.surveyFormId ?? null,
  };
}

type Values = ReturnType<typeof toValues>;

/** Campos que se congelan al abrir (ADR-035 regla 4). */
const FROZEN_FIELDS = [
  "termId",
  "kind",
  "assemblyKind",
  "category",
  "newMembersOnly",
  "startsAt",
  "endsAt",
  "checkInOpensAt",
  "checkInClosesAt",
  "points",
  "approval",
  "requireRotatingCode",
  "committeeId",
  "editionId",
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return a === b;
}

function boardElectionError(error: unknown): DomainError | null {
  if (isUniqueViolation(error, "occasion_board_election_unique")) {
    return new DomainError(t("T-576", { tipo: tList("T-565")[1] ?? "" }), "assemblyKind");
  }
  if (isUniqueViolation(error, "occasion_runoff_unique")) {
    return new DomainError(t("T-576", { tipo: tList("T-565")[2] ?? "" }), "assemblyKind");
  }
  return null;
}

export async function createOccasion(
  ctx: CommandContext,
  input: OccasionInput,
  context: OccasionContext,
): Promise<{ id: string; publicId: string }> {
  await lockOpenTermPoints(ctx.tx, context.termId);
  const values = toValues(input, context);
  // El alfabeto sin ambiguos da 50 bits: una colisión es improbable, pero se reintenta por si acaso.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicId = newPublicId();
    try {
      const [row] = await ctx.tx
        .insert(occasion)
        .values({
          ...values,
          publicId,
          rotatingSecret: input.requireRotatingCode ? newRotatingSecret() : null,
          createdById: ctx.actor.personId,
        })
        .returning({ id: occasion.id, publicId: occasion.publicId });
      if (!row) {
        throw new Error("No se pudo crear la ocasión");
      }
      await ctx.audit({
        action: "occasion.created",
        entityType: "occasion",
        entityId: row.id,
        after: { ...values, publicId },
      });
      return row;
    } catch (error) {
      const domain = boardElectionError(error);
      if (domain) {
        throw domain;
      }
      if (isUniqueViolation(error, "occasion_public_id_unique") && attempt < 2) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("No se pudo asignar un publicId");
}

export async function updateOccasion(
  ctx: CommandContext,
  id: string,
  input: OccasionInput,
  context: OccasionContext,
): Promise<void> {
  // Localiza términos sin bloquear la ocasión: el orden es término → ocasión. El UPDATE
  // condicional de abajo rechaza una transición o traslado concurrente.
  const [before] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input, context);
  if (before.status === "DRAFT" && before.termId !== values.termId) {
    for (const termId of [...new Set([before.termId, values.termId])].sort()) {
      await lockOpenTermPoints(ctx.tx, termId);
    }
  }
  if (before.status !== "DRAFT") {
    const changed = FROZEN_FIELDS.filter(
      (field) => !sameValue(before[field], (values as Record<string, unknown>)[field]),
    );
    if (changed.length > 0) {
      throw new DomainError(t("T-577"), changed[0]);
    }
  }
  const set: Partial<Values> & { rotatingSecret?: string | null } =
    before.status === "DRAFT"
      ? values
      : { title: values.title, description: values.description, location: values.location };
  if (before.status === "DRAFT" && values.requireRotatingCode && !before.rotatingSecret) {
    set.rotatingSecret = newRotatingSecret();
  }
  try {
    const changed = await ctx.tx
      .update(occasion)
      .set(set)
      .where(
        and(
          eq(occasion.id, id),
          eq(occasion.termId, before.termId),
          eq(occasion.status, before.status),
        ),
      )
      .returning({ id: occasion.id });
    if (changed.length === 0) {
      throw new DomainError(t("T-260"));
    }
  } catch (error) {
    throw boardElectionError(error) ?? error;
  }
  await ctx.audit({
    action: "occasion.updated",
    entityType: "occasion",
    entityId: id,
    before,
    after: set,
  });
}

async function transition(
  ctx: CommandContext,
  id: string,
  to: OccasionStatus,
): Promise<OccasionRow> {
  const [observed] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id));
  if (!observed) {
    throw new DomainError(t("T-032"));
  }
  // Cancelar afecta varias personas y después barre el término: necesita exclusividad antes de
  // tomar ocasión o rewards. Los demás cambios conservan el compartido. Nunca se asciende después.
  try {
    if (to === "CANCELLED") await lockParticipationBatch(ctx.tx);
    await lockOpenTermPoints(ctx.tx, observed.termId, to === "CANCELLED" ? "exclusive" : "shared");
  } catch (error) {
    if (to === "OPEN" && error instanceof DomainError && error.message === t("T-629")) {
      throw new DomainError(t("T-579"));
    }
    throw error;
  }
  const [before] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id)).for("update");
  if (!before || before.termId !== observed.termId) {
    throw new DomainError(t("T-260"));
  }
  if (!canTransitionOccasion(before.status, to)) {
    throw occasionStateError(before.status);
  }
  return before;
}

/** Quién abre una ocasión: ADMIN, o un líder que la opera (ADR-035). */
export interface OccasionOpener {
  isAdmin: boolean;
}

/**
 * Un líder abre por sí mismo solo la ocasión sin puntos (T-653). Lo decide el comando, con la fila ya
 * tomada, y no la pantalla con la ocasión que leyó antes (ADR-122 regla 2): unos puntos que cambian
 * entre esa lectura y el comando ya no pasan. Falla cerrado: quien no llega como ADMIN es líder.
 */
export async function openOccasion(
  ctx: CommandContext,
  id: string,
  opener: OccasionOpener,
): Promise<void> {
  const before = await transition(ctx, id, "OPEN");
  if (!canOpenOccasion({ isAdmin: opener?.isAdmin === true }, before)) {
    throw new DomainError(t("T-653"));
  }
  const rotatingSecret =
    before.requireRotatingCode && !before.rotatingSecret
      ? newRotatingSecret()
      : before.rotatingSecret;
  await ctx.tx
    .update(occasion)
    .set({ status: "OPEN", rotatingSecret, openedAt: new Date() })
    .where(eq(occasion.id, id));
  await ctx.audit({
    action: "occasion.opened",
    entityType: "occasion",
    entityId: id,
    before: { status: before.status },
    after: { status: "OPEN" },
  });
}

/** Cierra el registro; el score congela su denominador en el recompute que sigue (ADR-035 regla 11). */
export async function closeOccasion(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const before = await transition(ctx, id, "CLOSED");
  await ctx.tx.update(occasion).set({ status: "CLOSED", closedAt: now }).where(eq(occasion.id, id));
  await ctx.audit({
    action: "occasion.closed",
    entityType: "occasion",
    entityId: id,
    before: { status: before.status },
    after: { status: "CLOSED", closedAt: now.toISOString() },
  });
  await ctx.emit(
    eventOf(occasionClosed, { occasionId: id, termId: before.termId, points: before.points }),
  );
  if (before.points > 0) {
    await ctx.emit(eventOf(scoreRecompute, { occasionId: id }, { dedupeKey: `score:${id}` }));
  }
}

/** Cancela con motivo. Los créditos vivos se revierten en la misma transacción (ver check-ins). */
export async function cancelOccasion(
  ctx: CommandContext,
  id: string,
  reason: string,
  now = new Date(),
): Promise<OccasionRow> {
  const before = await transition(ctx, id, "CANCELLED");
  const cancelReason = reason.trim();
  if (!cancelReason) {
    throw new DomainError(t("T-609"), "reason");
  }
  await ctx.tx
    .update(occasion)
    .set({ status: "CANCELLED", cancelReason })
    .where(eq(occasion.id, id));
  await ctx.audit({
    action: "occasion.cancelled",
    entityType: "occasion",
    entityId: id,
    before: { status: before.status },
    after: { status: "CANCELLED", cancelReason, at: now.toISOString() },
  });
  return before;
}

export async function setRotatingCode(
  ctx: CommandContext,
  id: string,
  enabled: boolean,
): Promise<void> {
  const [before] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const rotatingSecret = enabled
    ? (before.rotatingSecret ?? newRotatingSecret())
    : before.rotatingSecret;
  await ctx.tx
    .update(occasion)
    .set({ requireRotatingCode: enabled, rotatingSecret })
    .where(eq(occasion.id, id));
  await ctx.audit({
    action: enabled ? "occasion.rotating-code.enabled" : "occasion.rotating-code.disabled",
    entityType: "occasion",
    entityId: id,
    before: { requireRotatingCode: before.requireRotatingCode },
    after: { requireRotatingCode: enabled },
  });
}

/** Un secreto nuevo invalida los códigos anteriores (por ejemplo, si el QR se filtró). */
export async function rotateSecret(ctx: CommandContext, id: string): Promise<void> {
  const [before] = await ctx.tx.select().from(occasion).where(eq(occasion.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx
    .update(occasion)
    .set({ rotatingSecret: newRotatingSecret() })
    .where(eq(occasion.id, id));
  await ctx.audit({
    action: "occasion.rotating-code.rotated",
    entityType: "occasion",
    entityId: id,
  });
}

// Lecturas.

export interface OccasionListParams {
  q: string;
  termId?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  committeeId?: string | undefined;
  /** Por defecto de la más reciente a la más vieja; "asc" para agendas (tablero del admin). */
  order?: "asc" | "desc" | undefined;
  page: number;
  pageSize: number;
}

export interface OccasionListRow extends OccasionRow {
  approvedCount: number;
}

// SQL crudo con la tabla exterior calificada: dentro de una plantilla `sql` las columnas salen sin
// calificar y `"id"` resolvería al id de `ci` (lección de la fase 1).
const approvedCount = sql<number>`(
  select count(*)::int from check_in ci
  where ci.occasion_id = occasion.id and ci.status = 'APPROVED' and ci.attendance_extent = 'FULL'
)`;

function listConditions(params: OccasionListParams) {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(occasion.title, `%${params.q}%`));
  }
  if (params.termId) {
    conditions.push(eq(occasion.termId, params.termId));
  }
  if (
    params.kind === "ACTIVITY" ||
    params.kind === "ASSEMBLY" ||
    params.kind === "EDITION_SESSION"
  ) {
    conditions.push(eq(occasion.kind, params.kind));
  }
  if (OCCASION_STATUSES.includes(params.status as OccasionStatus)) {
    conditions.push(eq(occasion.status, params.status as OccasionStatus));
  }
  if (params.committeeId) {
    conditions.push(eq(occasion.committeeId, params.committeeId));
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listOccasions(
  params: OccasionListParams,
): Promise<{ rows: OccasionListRow[]; total: number }> {
  const where = listConditions(params);
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: occasion, approvedCount })
      .from(occasion)
      .where(where)
      .orderBy(params.order === "asc" ? asc(occasion.startsAt) : desc(occasion.startsAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(occasion).where(where),
  ]);
  return {
    rows: rows.map((item) => ({ ...item.row, approvedCount: item.approvedCount })),
    total: total?.n ?? 0,
  };
}

export async function getOccasion(id: string): Promise<OccasionListRow | null> {
  const [item] = await getDb()
    .select({ row: occasion, approvedCount })
    .from(occasion)
    .where(eq(occasion.id, id))
    .limit(1);
  return item ? { ...item.row, approvedCount: item.approvedCount } : null;
}

export async function getOccasionByPublicId(publicId: string): Promise<OccasionRow | null> {
  const [row] = await getDb()
    .select()
    .from(occasion)
    .where(eq(occasion.publicId, publicId))
    .limit(1);
  return row ?? null;
}

/** Ocasiones de un término en ciertos estados, de la más reciente a la más vieja. */
export async function listOccasionsForTerm(
  termId: string,
  statuses: readonly OccasionStatus[] = OCCASION_STATUSES,
): Promise<OccasionRow[]> {
  return getDb()
    .select()
    .from(occasion)
    .where(and(eq(occasion.termId, termId), inArray(occasion.status, [...statuses])))
    .orderBy(desc(occasion.startsAt));
}

export async function countOpenOccasions(
  termId: string,
  exec: Executor = getDb(),
): Promise<number> {
  const [row] = await exec
    .select({ n: count() })
    .from(occasion)
    .where(and(eq(occasion.termId, termId), eq(occasion.status, "OPEN")));
  return row?.n ?? 0;
}

export interface OccasionRef {
  id: string;
  title: string;
  startsAt: Date;
  status: OccasionStatus;
}

/** Búsqueda por similitud sobre el título, para la paleta ⌘K. */
export async function searchOccasions(q: string, limit = 8): Promise<OccasionRef[]> {
  return getDb()
    .select({
      id: occasion.id,
      title: occasion.title,
      startsAt: occasion.startsAt,
      status: occasion.status,
    })
    .from(occasion)
    .where(or(sql`similarity(${occasion.title}, ${q}) > 0.2`, ilike(occasion.title, `%${q}%`)))
    .orderBy(sql`similarity(${occasion.title}, ${q}) desc`, asc(occasion.startsAt))
    .limit(limit);
}

/** Ocasiones abiertas del término cuya ventana no venció, de la más próxima a la más lejana (agenda de Mi OE). */
export async function listMemberAgenda(
  termId: string,
  now = new Date(),
  limit = 6,
): Promise<OccasionRow[]> {
  return getDb()
    .select()
    .from(occasion)
    .where(
      and(
        eq(occasion.termId, termId),
        eq(occasion.status, "OPEN"),
        sql`${occasion.checkInClosesAt} > ${now}`,
      ),
    )
    .orderBy(asc(occasion.startsAt))
    .limit(limit);
}

/** Ocasiones por id, para mostrar títulos junto a check-ins y entradas. */
export async function getOccasionsByIds(ids: string[]): Promise<Map<string, OccasionRow>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb().select().from(occasion).where(inArray(occasion.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

// Serie semanal de reuniones de comité (ADR-035 regla 15): una ocasión independiente por semana,
// COMMITTEE_MEETING sin puntos, hasta el fin del término; idempotente por comité y fecha.

export interface SeriesInput {
  committeeId: string;
  title: string;
  /** Instante de la primera reunión (ya en UTC). */
  firstStartsAt: Date;
  durationMinutes: number;
  location: string;
}

export const MAX_SERIES = 30;

/** Fechas semanales desde la primera hasta el fin del término (inclusive), como instantes UTC. */
export function weeklyDates(firstStartsAt: Date, termEndsOn: string): Date[] {
  const end = new Date(`${termEndsOn}T23:59:59.999-05:00`);
  const dates: Date[] = [];
  for (
    let at = firstStartsAt;
    at <= end && dates.length < MAX_SERIES;
    at = new Date(at.getTime() + 7 * 86_400_000)
  ) {
    dates.push(at);
  }
  return dates;
}

export async function createOccasionSeries(
  ctx: CommandContext,
  input: SeriesInput,
  context: OccasionContext & { termEndsOn: string },
): Promise<{ created: number; skipped: number; lastStartsAt: Date | null }> {
  await lockOpenTermPoints(ctx.tx, context.termId);
  const dates = weeklyDates(input.firstStartsAt, context.termEndsOn);
  if (dates.length === 0) {
    throw new DomainError(t("T-675"), "firstStartsAt");
  }
  const existing = await ctx.tx
    .select({ startsAt: occasion.startsAt })
    .from(occasion)
    .where(
      and(
        eq(occasion.committeeId, input.committeeId),
        eq(occasion.category, "COMMITTEE_MEETING"),
        inArray(occasion.startsAt, dates),
      ),
    );
  const taken = new Set(existing.map((row) => row.startsAt.getTime()));
  let created = 0;
  for (const startsAt of dates) {
    if (taken.has(startsAt.getTime())) {
      continue;
    }
    const window = defaultWindow(startsAt, context.window);
    const [row] = await ctx.tx
      .insert(occasion)
      .values({
        publicId: newPublicId(),
        termId: context.termId,
        kind: "ACTIVITY",
        category: "COMMITTEE_MEETING",
        title: input.title,
        location: input.location,
        startsAt,
        endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
        checkInOpensAt: window.checkInOpensAt,
        checkInClosesAt: window.checkInClosesAt,
        points: 0,
        approval: "AUTO",
        committeeId: input.committeeId,
        status: "OPEN",
        openedAt: new Date(),
        createdById: ctx.actor.personId,
      })
      .returning({ id: occasion.id });
    if (row) {
      created += 1;
      await ctx.audit({
        action: "occasion.created",
        entityType: "occasion",
        entityId: row.id,
        after: { series: true, committeeId: input.committeeId, startsAt: startsAt.toISOString() },
      });
    }
  }
  return { created, skipped: dates.length - created, lastStartsAt: dates.at(-1) ?? null };
}
