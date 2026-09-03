import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { committee } from "../schema";

// Comités: ficha editorial con logo, presentación y contacto (03-modelo-de-datos.md).

export type CommitteeRow = typeof committee.$inferSelect;

export const committeeInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  logoKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  presentation: z.string().trim().max(5_000).optional(),
  contactUrl: z.url().optional(),
  publicationStatus: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export type CommitteeInput = z.infer<typeof committeeInputSchema>;

export interface CommitteeListParams {
  q: string;
  status?: string | undefined;
  publicationStatus?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listCommittees(
  params: CommitteeListParams,
): Promise<{ rows: CommitteeRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(
      or(ilike(committee.name, `%${params.q}%`), ilike(committee.slug, `%${params.q}%`)),
    );
  }
  if (params.status === "ACTIVE" || params.status === "INACTIVE") {
    conditions.push(eq(committee.status, params.status));
  }
  if (params.publicationStatus === "DRAFT" || params.publicationStatus === "PUBLISHED") {
    conditions.push(eq(committee.publicationStatus, params.publicationStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(committee)
      .where(where)
      .orderBy(asc(committee.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(committee).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getCommittee(id: string): Promise<CommitteeRow | null> {
  const [row] = await getDb().select().from(committee).where(eq(committee.id, id)).limit(1);
  return row ?? null;
}

export async function listAllCommittees(): Promise<
  Array<{ id: string; slug: string; name: string }>
> {
  return getDb()
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .orderBy(asc(committee.name));
}

/** Búsqueda por similitud (pg_trgm) para la paleta ⌘K. */
export async function searchCommittees(
  q: string,
  limit = 6,
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const pattern = `%${q}%`;
  return getDb()
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .where(
      or(
        sql`similarity(${committee.name}, ${q}) > 0.2`,
        ilike(committee.name, pattern),
        ilike(committee.slug, pattern),
      ),
    )
    .orderBy(
      sql`greatest(similarity(${committee.name}, ${q}), similarity(${committee.slug}, ${q})) desc`,
    )
    .limit(limit);
}

/** Ficha editorial pública: logo, presentación y contacto; el roster nunca sale (ADR-014). */
export interface PublicCommittee {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  presentation: string | null;
  contactUrl: string | null;
}

const publicColumns = {
  id: committee.id,
  slug: committee.slug,
  name: committee.name,
  logoKey: committee.logoKey,
  presentation: committee.presentation,
  contactUrl: committee.contactUrl,
};

const isPublic = and(eq(committee.status, "ACTIVE"), eq(committee.publicationStatus, "PUBLISHED"));

export const listPublishedCommittees = cache(async (): Promise<PublicCommittee[]> => {
  return getDb().select(publicColumns).from(committee).where(isPublic).orderBy(asc(committee.name));
});

export const getPublishedCommittee = cache(
  async (slug: string): Promise<PublicCommittee | null> => {
    const [row] = await getDb()
      .select(publicColumns)
      .from(committee)
      .where(and(isPublic, eq(committee.slug, slug)))
      .limit(1);
    return row ?? null;
  },
);

function toValues(input: CommitteeInput) {
  return {
    slug: input.slug,
    name: input.name,
    status: input.status,
    color: input.color ?? null,
    logoKey: input.logoKey ?? null,
    presentation: input.presentation ?? null,
    contactUrl: input.contactUrl ?? null,
    publicationStatus: input.publicationStatus,
  };
}

export async function createCommittee(
  ctx: CommandContext,
  input: CommitteeInput,
): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx
      .insert(committee)
      .values(toValues(input))
      .returning({ id: committee.id });
    if (!row) {
      throw new Error("No se pudo crear el comité");
    }
    await ctx.audit({
      action: "committee.created",
      entityType: "committee",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "committee_slug_unique")) {
      throw new DomainError(t("T-292"), "slug");
    }
    throw error;
  }
}

export async function updateCommittee(
  ctx: CommandContext,
  id: string,
  input: CommitteeInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(committee).where(eq(committee.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = { ...toValues(input), slug: before.slug }; // la sigla no cambia: es parte de la URL y del logo
  try {
    await ctx.tx.update(committee).set(values).where(eq(committee.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "committee_slug_unique")) {
      throw new DomainError(t("T-292"), "slug");
    }
    throw error;
  }
  await ctx.audit({
    action: "committee.updated",
    entityType: "committee",
    entityId: id,
    before,
    after: values,
  });
}
