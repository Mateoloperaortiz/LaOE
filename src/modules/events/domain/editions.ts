import { and, asc, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { editionCommittee, event, eventEdition } from "../schema";
import { SLUG_PATTERN } from "./events";

// Ediciones fechadas de un evento, con lugar, organizadores, portada e inscripción externa (ADR-033).

export type EditionRow = typeof eventEdition.$inferSelect;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_INPUT, { message: t("T-298") });

export const editionInputSchema = z
  .object({
    eventId: z.string().trim().min(1),
    slug: z.string().trim().toLowerCase().min(2).max(60).regex(SLUG_PATTERN),
    name: z.string().trim().min(2).max(80),
    description: z.string().max(20_000).default(""),
    startsAt: localDateTime.transform(bogotaInputToUtc),
    endsAt: localDateTime.transform(bogotaInputToUtc).optional(),
    location: z.string().trim().max(200).default(""),
    registrationUrl: z.url().optional(),
    publicationStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    coverAssetId: z
      .string()
      .trim()
      .regex(/^[a-z0-9]{10,40}$/)
      .optional(),
    committeeIds: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((input) => input.endsAt === undefined || input.endsAt > input.startsAt, {
    path: ["endsAt"],
    message: t("T-298"),
  });

export type EditionInput = z.infer<typeof editionInputSchema>;

export interface EditionListRow extends EditionRow {
  eventName: string;
  eventSlug: string;
  committeeIds: string[];
}

export interface EditionListParams {
  q: string;
  eventId?: string | undefined;
  publicationStatus?: string | undefined;
  page: number;
  pageSize: number;
}

async function organizersFor(editionIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (editionIds.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ editionId: editionCommittee.editionId, committeeId: editionCommittee.committeeId })
    .from(editionCommittee)
    .where(inArray(editionCommittee.editionId, editionIds));
  for (const row of rows) {
    map.set(row.editionId, [...(map.get(row.editionId) ?? []), row.committeeId]);
  }
  return map;
}

const listColumns = {
  id: eventEdition.id,
  eventId: eventEdition.eventId,
  slug: eventEdition.slug,
  name: eventEdition.name,
  description: eventEdition.description,
  startsAt: eventEdition.startsAt,
  endsAt: eventEdition.endsAt,
  location: eventEdition.location,
  registrationUrl: eventEdition.registrationUrl,
  publicationStatus: eventEdition.publicationStatus,
  coverAssetId: eventEdition.coverAssetId,
  createdAt: eventEdition.createdAt,
  updatedAt: eventEdition.updatedAt,
  eventName: event.name,
  eventSlug: event.slug,
};

export async function listEditions(
  params: EditionListParams,
): Promise<{ rows: EditionListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(eventEdition.name, `%${params.q}%`));
  }
  if (params.eventId) {
    conditions.push(eq(eventEdition.eventId, params.eventId));
  }
  if (params.publicationStatus === "DRAFT" || params.publicationStatus === "PUBLISHED") {
    conditions.push(eq(eventEdition.publicationStatus, params.publicationStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select(listColumns)
      .from(eventEdition)
      .innerJoin(event, eq(event.id, eventEdition.eventId))
      .where(where)
      .orderBy(desc(eventEdition.startsAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(eventEdition).where(where),
  ]);
  const organizers = await organizersFor(rows.map((row) => row.id));
  return {
    rows: rows.map((row) => ({ ...row, committeeIds: organizers.get(row.id) ?? [] })),
    total: total?.n ?? 0,
  };
}

export interface CommitteeEditionRow {
  id: string;
  name: string;
  eventName: string;
  startsAt: Date;
  publicationStatus: "DRAFT" | "PUBLISHED";
}

/** Las ediciones donde el comité es organizador, de la más reciente a la más vieja (ADR-058). */
export async function listEditionsByCommittee(
  committeeId: string,
  limit = 12,
): Promise<CommitteeEditionRow[]> {
  return getDb()
    .select({
      id: eventEdition.id,
      name: eventEdition.name,
      eventName: event.name,
      startsAt: eventEdition.startsAt,
      publicationStatus: eventEdition.publicationStatus,
    })
    .from(editionCommittee)
    .innerJoin(eventEdition, eq(eventEdition.id, editionCommittee.editionId))
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(eq(editionCommittee.committeeId, committeeId))
    .orderBy(desc(eventEdition.startsAt))
    .limit(limit);
}

export interface EditionOption {
  id: string;
  label: string;
  startsAt: Date;
}

/** Ediciones como opciones de un select ("Evento · Edición"), de la más reciente a la más vieja. */
export async function listEditionOptions(limit = 200): Promise<EditionOption[]> {
  const rows = await getDb()
    .select({
      id: eventEdition.id,
      name: eventEdition.name,
      eventName: event.name,
      startsAt: eventEdition.startsAt,
    })
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .orderBy(desc(eventEdition.startsAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    label: `${row.eventName} · ${row.name}`,
    startsAt: row.startsAt,
  }));
}

export interface EditionRef {
  id: string;
  name: string;
  eventName: string;
  startsAt: Date;
}

/** Nombre y evento de varias ediciones por id (para etiquetar cargos de macroevento, ADR-060 regla 9). */
export async function listEditionRefs(ids: readonly string[]): Promise<Map<string, EditionRef>> {
  const map = new Map<string, EditionRef>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({
      id: eventEdition.id,
      name: eventEdition.name,
      eventName: event.name,
      startsAt: eventEdition.startsAt,
    })
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(inArray(eventEdition.id, [...ids]));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

export async function getEdition(id: string): Promise<EditionListRow | null> {
  const [row] = await getDb()
    .select(listColumns)
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(eq(eventEdition.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const organizers = await organizersFor([row.id]);
  return { ...row, committeeIds: organizers.get(row.id) ?? [] };
}

function toValues(input: EditionInput) {
  return {
    eventId: input.eventId,
    slug: input.slug,
    name: input.name,
    description: input.description,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    location: input.location,
    registrationUrl: input.registrationUrl ?? null,
    publicationStatus: input.publicationStatus,
    coverAssetId: input.coverAssetId ?? null,
  };
}

async function replaceOrganizers(
  ctx: CommandContext,
  editionId: string,
  committeeIds: string[],
): Promise<void> {
  await ctx.tx.delete(editionCommittee).where(eq(editionCommittee.editionId, editionId));
  const unique = [...new Set(committeeIds)];
  if (unique.length > 0) {
    await ctx.tx
      .insert(editionCommittee)
      .values(unique.map((committeeId) => ({ editionId, committeeId })));
  }
}

export async function createEdition(
  ctx: CommandContext,
  input: EditionInput,
): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx
      .insert(eventEdition)
      .values(toValues(input))
      .returning({ id: eventEdition.id });
    if (!row) {
      throw new Error("No se pudo crear la edición");
    }
    await replaceOrganizers(ctx, row.id, input.committeeIds);
    await ctx.audit({
      action: "edition.created",
      entityType: "event_edition",
      entityId: row.id,
      after: { ...toValues(input), committeeIds: input.committeeIds },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "event_edition_event_slug_unique")) {
      throw new DomainError(t("T-367"), "slug");
    }
    throw error;
  }
}

export async function updateEdition(
  ctx: CommandContext,
  id: string,
  input: EditionInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(eventEdition).where(eq(eventEdition.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  // El identificador es la URL y el evento es su dueño: ninguno cambia al editar.
  const values = { ...toValues(input), slug: before.slug, eventId: before.eventId };
  await ctx.tx.update(eventEdition).set(values).where(eq(eventEdition.id, id));
  await replaceOrganizers(ctx, id, input.committeeIds);
  await ctx.audit({
    action: "edition.updated",
    entityType: "event_edition",
    entityId: id,
    before,
    after: { ...values, committeeIds: input.committeeIds },
  });
}

/** Lo que el portal muestra de una edición. */
export interface PublicEdition {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  registrationUrl: string | null;
  coverAssetId: string | null;
  updatedAt: Date;
  event: { id: string; slug: string; name: string };
  committeeIds: string[];
}

const publicColumns = {
  id: eventEdition.id,
  slug: eventEdition.slug,
  name: eventEdition.name,
  description: eventEdition.description,
  startsAt: eventEdition.startsAt,
  endsAt: eventEdition.endsAt,
  location: eventEdition.location,
  registrationUrl: eventEdition.registrationUrl,
  coverAssetId: eventEdition.coverAssetId,
  updatedAt: eventEdition.updatedAt,
  eventId: event.id,
  eventSlug: event.slug,
  eventName: event.name,
};

type PublicRaw = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  registrationUrl: string | null;
  coverAssetId: string | null;
  updatedAt: Date;
  eventId: string;
  eventSlug: string;
  eventName: string;
};

function asPublic(row: PublicRaw, committeeIds: string[]): PublicEdition {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.location,
    registrationUrl: row.registrationUrl,
    coverAssetId: row.coverAssetId,
    updatedAt: row.updatedAt,
    event: { id: row.eventId, slug: row.eventSlug, name: row.eventName },
    committeeIds,
  };
}

const isPublic = and(
  eq(eventEdition.publicationStatus, "PUBLISHED"),
  eq(event.publicationStatus, "PUBLISHED"),
  eq(event.audience, "PUBLIC"),
);

async function withOrganizers(rows: PublicRaw[]): Promise<PublicEdition[]> {
  const organizers = await organizersFor(rows.map((row) => row.id));
  return rows.map((row) => asPublic(row, organizers.get(row.id) ?? []));
}

/** Ediciones publicadas de un evento, de la más reciente a la más antigua. */
export const listPublishedEditionsOf = cache(async (eventId: string): Promise<PublicEdition[]> => {
  const rows = await getDb()
    .select(publicColumns)
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(and(isPublic, eq(eventEdition.eventId, eventId)))
    .orderBy(desc(eventEdition.startsAt));
  return withOrganizers(rows);
});

export const getPublishedEdition = cache(
  async (eventSlug: string, editionSlug: string): Promise<PublicEdition | null> => {
    const [row] = await getDb()
      .select(publicColumns)
      .from(eventEdition)
      .innerJoin(event, eq(event.id, eventEdition.eventId))
      .where(and(isPublic, eq(event.slug, eventSlug), eq(eventEdition.slug, editionSlug)))
      .limit(1);
    if (!row) {
      return null;
    }
    const [edition] = await withOrganizers([row]);
    return edition ?? null;
  },
);

/** La próxima edición pública de cada evento publicado (la más cercana que todavía no empezó). */
export const findNextPublicEditions = cache(
  async (now = new Date()): Promise<Map<string, PublicEdition>> => {
    const rows = await getDb()
      .select(publicColumns)
      .from(eventEdition)
      .innerJoin(event, eq(event.id, eventEdition.eventId))
      .where(and(isPublic, gte(eventEdition.startsAt, now)))
      .orderBy(asc(eventEdition.startsAt));
    const editions = await withOrganizers(rows);
    const next = new Map<string, PublicEdition>();
    for (const edition of editions) {
      if (!next.has(edition.event.id)) {
        next.set(edition.event.id, edition);
      }
    }
    return next;
  },
);

/** El próximo encuentro del inicio: la edición pública más cercana en el futuro. */
export const findNextPublicEdition = cache(
  async (now = new Date()): Promise<PublicEdition | null> => {
    const [row] = await getDb()
      .select(publicColumns)
      .from(eventEdition)
      .innerJoin(event, eq(event.id, eventEdition.eventId))
      .where(and(isPublic, gte(eventEdition.startsAt, now)))
      .orderBy(asc(eventEdition.startsAt))
      .limit(1);
    if (!row) {
      return null;
    }
    const [edition] = await withOrganizers([row]);
    return edition ?? null;
  },
);

/** Todas las ediciones públicas para el calendario ICS (pasadas y futuras). */
export const listPublicEditionsForIcs = cache(async (): Promise<PublicEdition[]> => {
  const rows = await getDb()
    .select(publicColumns)
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(isPublic)
    .orderBy(asc(eventEdition.startsAt))
    .limit(500);
  return withOrganizers(rows);
});

export interface MemberEdition extends PublicEdition {
  audience: "PUBLIC" | "MEMBERS";
}

const isForMembers = and(
  eq(eventEdition.publicationStatus, "PUBLISHED"),
  eq(event.publicationStatus, "PUBLISHED"),
  inArray(event.audience, ["PUBLIC", "MEMBERS"]),
);

/** El ICS personal (ADR-038 regla 12): ediciones publicadas públicas o de miembros. */
export const listMemberEditionsForIcs = cache(async (): Promise<PublicEdition[]> => {
  const rows = await getDb()
    .select(publicColumns)
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(isForMembers)
    .orderBy(asc(eventEdition.startsAt))
    .limit(500);
  return withOrganizers(rows);
});

/** La agenda de Mi OE: ediciones publicadas (públicas o de miembros) que no han terminado. */
export const findUpcomingEditionsForMembers = cache(
  async (limit = 6, now = new Date()): Promise<MemberEdition[]> => {
    const rows = await getDb()
      .select({ ...publicColumns, audience: event.audience })
      .from(eventEdition)
      .innerJoin(event, eq(event.id, eventEdition.eventId))
      .where(and(isForMembers, or(gte(eventEdition.startsAt, now), gte(eventEdition.endsAt, now))))
      .orderBy(asc(eventEdition.startsAt))
      .limit(limit);
    const editions = await withOrganizers(rows);
    return editions.map((edition, index) => ({
      ...edition,
      audience: rows[index]?.audience === "MEMBERS" ? "MEMBERS" : "PUBLIC",
    }));
  },
);
