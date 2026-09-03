import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { event, eventEdition } from "../schema";

// Eventos permanentes (Días EAFIT, Inventiva, EnFemenino, Subsidios-OE y los que se creen): identidad,
// resumen, descripción en Markdown, portada y orden en el inicio (ADR-033).

export type EventRow = typeof event.$inferSelect;

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export const eventInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(SLUG_PATTERN),
  name: z.string().trim().min(2).max(80),
  summary: z.string().trim().max(300).default(""),
  description: z.string().max(20_000).default(""),
  audience: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
  publicationStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  coverAssetId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{10,40}$/)
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export interface EventListRow extends EventRow {
  editionCount: number;
}

export interface EventListParams {
  q: string;
  publicationStatus?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listEvents(
  params: EventListParams,
): Promise<{ rows: EventListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(or(ilike(event.name, `%${params.q}%`), ilike(event.slug, `%${params.q}%`)));
  }
  if (params.publicationStatus === "DRAFT" || params.publicationStatus === "PUBLISHED") {
    conditions.push(eq(event.publicationStatus, params.publicationStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  // Dentro de una plantilla sql Drizzle no califica las columnas y el "id" se resolvería contra
  // event_edition: se escriben los identificadores completos.
  const editionCount = sql<number>`(select count(*)::int from ${eventEdition} where ${sql.identifier("event_edition")}.${sql.identifier("event_id")} = ${sql.identifier("event")}.${sql.identifier("id")})`;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: event.id,
        slug: event.slug,
        name: event.name,
        summary: event.summary,
        description: event.description,
        audience: event.audience,
        publicationStatus: event.publicationStatus,
        coverAssetId: event.coverAssetId,
        sortOrder: event.sortOrder,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        editionCount,
      })
      .from(event)
      .where(where)
      .orderBy(asc(event.sortOrder), asc(event.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(event).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getEvent(id: string): Promise<EventListRow | null> {
  const { rows } = await listEvents({ q: "", page: 1, pageSize: 1000 });
  return rows.find((row) => row.id === id) ?? null;
}

/** Nombres para el selector de evento de una edición. */
export async function listAllEvents(): Promise<Array<{ id: string; name: string; slug: string }>> {
  return getDb()
    .select({ id: event.id, name: event.name, slug: event.slug })
    .from(event)
    .orderBy(asc(event.sortOrder), asc(event.name));
}

function toValues(input: EventInput) {
  return {
    slug: input.slug,
    name: input.name,
    summary: input.summary,
    description: input.description,
    audience: input.audience,
    publicationStatus: input.publicationStatus,
    coverAssetId: input.coverAssetId ?? null,
    sortOrder: input.sortOrder,
  };
}

export async function createEvent(ctx: CommandContext, input: EventInput): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx.insert(event).values(toValues(input)).returning({ id: event.id });
    if (!row) {
      throw new Error("No se pudo crear el evento");
    }
    await ctx.audit({
      action: "event.created",
      entityType: "event",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "event_slug_unique")) {
      throw new DomainError(t("T-367"), "slug");
    }
    throw error;
  }
}

export async function updateEvent(
  ctx: CommandContext,
  id: string,
  input: EventInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(event).where(eq(event.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = { ...toValues(input), slug: before.slug }; // el identificador es la URL: no cambia
  await ctx.tx.update(event).set(values).where(eq(event.id, id));
  await ctx.audit({
    action: "event.updated",
    entityType: "event",
    entityId: id,
    before,
    after: values,
  });
}

/** Lo que el portal muestra de un evento. */
export interface PublicEvent {
  id: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  coverAssetId: string | null;
  sortOrder: number;
}

const publicColumns = {
  id: event.id,
  slug: event.slug,
  name: event.name,
  summary: event.summary,
  description: event.description,
  coverAssetId: event.coverAssetId,
  sortOrder: event.sortOrder,
};

const isPublic = and(eq(event.audience, "PUBLIC"), eq(event.publicationStatus, "PUBLISHED"));

export const listPublishedEvents = cache(async (): Promise<PublicEvent[]> => {
  return getDb()
    .select(publicColumns)
    .from(event)
    .where(isPublic)
    .orderBy(asc(event.sortOrder), asc(event.name));
});

export const getPublishedEvent = cache(async (slug: string): Promise<PublicEvent | null> => {
  const [row] = await getDb()
    .select(publicColumns)
    .from(event)
    .where(and(isPublic, eq(event.slug, slug)))
    .limit(1);
  return row ?? null;
});
