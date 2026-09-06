import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { announcement } from "../schema";
import { excerpt } from "./markdown-pure";

// Cartelera (ADR-015, ADR-033, ADR-038): un anuncio es público cuando su audiencia es PUBLIC y ya pasó
// su fecha de publicación; los fijados van primero. El push se pide una vez desde el admin y lo
// entrega comms, que resuelve la audiencia y estampa el envío.

export type AnnouncementRow = typeof announcement.$inferSelect;

export const announcementInputSchema = z.object({
  title: z.string().trim().min(2).max(140),
  body: z.string().max(20_000).default(""),
  audience: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
  pinned: z.boolean().default(false),
  /** Cartelera interna de un comité (ADR-036): solo con audiencia de miembros. */
  committeeId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export interface AnnouncementListParams {
  q: string;
  audience?: string | undefined;
  /** DRAFT: sin fecha de publicación; PUBLISHED: con fecha. */
  publication?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listAnnouncements(
  params: AnnouncementListParams,
): Promise<{ rows: AnnouncementRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(announcement.title, `%${params.q}%`));
  }
  if (params.audience === "PUBLIC" || params.audience === "MEMBERS") {
    conditions.push(eq(announcement.audience, params.audience));
  }
  if (params.publication === "DRAFT") {
    conditions.push(isNull(announcement.publishedAt));
  } else if (params.publication === "PUBLISHED") {
    conditions.push(isNotNull(announcement.publishedAt));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(announcement)
      .where(where)
      .orderBy(desc(announcement.pinned), desc(announcement.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(announcement).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getAnnouncement(id: string): Promise<AnnouncementRow | null> {
  const [row] = await getDb().select().from(announcement).where(eq(announcement.id, id)).limit(1);
  return row ?? null;
}

function toValues(input: AnnouncementInput) {
  return {
    title: input.title,
    body: input.body,
    audience: input.committeeId ? ("MEMBERS" as const) : input.audience,
    pinned: input.pinned,
    committeeId: input.committeeId ?? null,
  };
}

export async function createAnnouncement(
  ctx: CommandContext,
  input: AnnouncementInput,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(announcement)
    .values({ ...toValues(input), createdById: ctx.actor.personId })
    .returning({ id: announcement.id });
  if (!row) {
    throw new Error("No se pudo crear el anuncio");
  }
  await ctx.audit({
    action: "announcement.created",
    entityType: "announcement",
    entityId: row.id,
    after: toValues(input),
  });
  return row;
}

export async function updateAnnouncement(
  ctx: CommandContext,
  id: string,
  input: AnnouncementInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(announcement).where(eq(announcement.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input);
  await ctx.tx.update(announcement).set(values).where(eq(announcement.id, id));
  await ctx.audit({
    action: "announcement.updated",
    entityType: "announcement",
    entityId: id,
    before,
    after: values,
  });
}

/** Publica ahora un anuncio sin fecha; uno ya publicado no cambia. */
export async function publishAnnouncement(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const [before] = await ctx.tx.select().from(announcement).where(eq(announcement.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.publishedAt !== null) {
    return;
  }
  await ctx.tx.update(announcement).set({ publishedAt: now }).where(eq(announcement.id, id));
  await ctx.audit({
    action: "announcement.published",
    entityType: "announcement",
    entityId: id,
    before: { publishedAt: null },
    after: { publishedAt: now.toISOString() },
  });
}

/** Título y primera línea del anuncio para el push (T-180) y la URL que abre. */
function pushPayloadFor(row: AnnouncementRow) {
  return {
    announcementId: row.id,
    title: row.title,
    excerpt: excerpt(row.body, 120),
    audience: row.audience,
    committeeId: row.committeeId,
    url:
      row.audience === "PUBLIC" && !row.committeeId
        ? `/cartelera/${row.id}`
        : `/app/cartelera/${row.id}`,
  };
}

/**
 * Pide el push de un anuncio ya publicado (ADR-038 regla 6): una sola vez por anuncio. `comms` lo
 * entrega por outbox y marca el envío con `markAnnouncementPushSent`.
 */
export async function requestAnnouncementPush(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const [row] = await ctx.tx.select().from(announcement).where(eq(announcement.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.publishedAt === null || row.pushRequestedAt !== null) {
    return;
  }
  await ctx.tx.update(announcement).set({ pushRequestedAt: now }).where(eq(announcement.id, id));
  await ctx.audit({
    action: "announcement.push-requested",
    entityType: "announcement",
    entityId: id,
    after: { pushRequestedAt: now.toISOString() },
  });
  await ctx.emit({
    type: "announcement.push-requested",
    payload: { ...pushPayloadFor(row), actorId: ctx.actor.personId },
    dedupeKey: `announcement-push:${id}`,
  });
}

/** Publica y pide el push en la misma transacción ("Publicar y avisar por push"). */
export async function publishAndPushAnnouncement(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  await publishAnnouncement(ctx, id, now);
  await requestAnnouncementPush(ctx, id, now);
}

/** Lo llama comms al terminar de entregar el push: fecha y cuántas personas lo recibieron. */
export async function markAnnouncementPushSent(
  id: string,
  count: number,
  now = new Date(),
): Promise<void> {
  await getDb()
    .update(announcement)
    .set({ pushSentAt: now, pushCount: count })
    .where(eq(announcement.id, id));
}

export async function unpublishAnnouncement(ctx: CommandContext, id: string): Promise<void> {
  const [before] = await ctx.tx.select().from(announcement).where(eq(announcement.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.publishedAt === null) {
    return;
  }
  await ctx.tx.update(announcement).set({ publishedAt: null }).where(eq(announcement.id, id));
  await ctx.audit({
    action: "announcement.unpublished",
    entityType: "announcement",
    entityId: id,
    before: { publishedAt: before.publishedAt.toISOString() },
    after: { publishedAt: null },
  });
}

export interface PublicAnnouncement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: Date;
}

const publicColumns = {
  id: announcement.id,
  title: announcement.title,
  body: announcement.body,
  pinned: announcement.pinned,
  publishedAt: announcement.publishedAt,
};

function asPublic(row: {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  publishedAt: Date | null;
}): PublicAnnouncement {
  return { ...row, publishedAt: row.publishedAt ?? new Date(0) };
}

/** Anuncios públicos ya publicados: fijados primero, luego los más recientes. */
export const listPublicAnnouncements = cache(async (limit = 20): Promise<PublicAnnouncement[]> => {
  const rows = await getDb()
    .select(publicColumns)
    .from(announcement)
    .where(and(eq(announcement.audience, "PUBLIC"), lte(announcement.publishedAt, new Date())))
    .orderBy(desc(announcement.pinned), desc(announcement.publishedAt))
    .limit(limit);
  return rows.map(asPublic);
});

export const getPublicAnnouncement = cache(
  async (id: string): Promise<PublicAnnouncement | null> => {
    const [row] = await getDb()
      .select(publicColumns)
      .from(announcement)
      .where(
        and(
          eq(announcement.id, id),
          eq(announcement.audience, "PUBLIC"),
          lte(announcement.publishedAt, new Date()),
        ),
      )
      .limit(1);
    return row ? asPublic(row) : null;
  },
);

export interface MemberAnnouncement extends PublicAnnouncement {
  audience: "PUBLIC" | "MEMBERS";
}

/** La cartelera de Mi OE: anuncios publicados para el público o solo para miembros. */
export const listMemberAnnouncements = cache(async (limit = 12): Promise<MemberAnnouncement[]> => {
  const rows = await getDb()
    .select({ ...publicColumns, audience: announcement.audience })
    .from(announcement)
    .where(
      and(
        inArray(announcement.audience, ["PUBLIC", "MEMBERS"]),
        lte(announcement.publishedAt, new Date()),
        // Los anuncios de un comité viven solo en su cartelera interna (ADR-036).
        isNull(announcement.committeeId),
      ),
    )
    .orderBy(desc(announcement.pinned), desc(announcement.publishedAt))
    .limit(limit);
  return rows.map((row) => ({
    ...asPublic(row),
    audience: row.audience === "MEMBERS" ? "MEMBERS" : "PUBLIC",
  }));
});

/** Un anuncio de miembros o de comité ya publicado, para su página en Mi OE (ADR-038 regla 6). */
export const getMemberAnnouncement = cache(
  async (id: string): Promise<(MemberAnnouncement & { committeeId: string | null }) | null> => {
    const [row] = await getDb()
      .select({
        ...publicColumns,
        audience: announcement.audience,
        committeeId: announcement.committeeId,
      })
      .from(announcement)
      .where(and(eq(announcement.id, id), lte(announcement.publishedAt, new Date())))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      ...asPublic(row),
      audience: row.audience === "MEMBERS" ? "MEMBERS" : "PUBLIC",
      committeeId: row.committeeId,
    };
  },
);

/** La cartelera interna de un comité: anuncios publicados con su `committeeId`, los fijados primero. */
export const listCommitteeAnnouncements = cache(
  async (committeeId: string, limit = 12): Promise<MemberAnnouncement[]> => {
    const rows = await getDb()
      .select({ ...publicColumns, audience: announcement.audience })
      .from(announcement)
      .where(
        and(eq(announcement.committeeId, committeeId), lte(announcement.publishedAt, new Date())),
      )
      .orderBy(desc(announcement.pinned), desc(announcement.publishedAt))
      .limit(limit);
    return rows.map((row) => ({
      ...asPublic(row),
      audience: row.audience === "MEMBERS" ? "MEMBERS" : "PUBLIC",
    }));
  },
);
