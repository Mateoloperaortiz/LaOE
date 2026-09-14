import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { committee } from "../schema";
import { committeeLifecycleError } from "./committee-lifecycle-pure";

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
  status: z.enum(["ACTIVE", "INACTIVE", "ON_TRIAL"]).default("ACTIVE"),
  /** Periodo de prueba de un comité creado o reactivado (Regl. art. 25; ADR-060 regla 8). */
  trialStartsOn: z.union([z.literal(""), z.iso.date()]).default(""),
  trialEndsOn: z.union([z.literal(""), z.iso.date()]).default(""),
  /** Cuándo la junta lo desactivó (Regl. art. 26). */
  deactivatedOn: z.union([z.literal(""), z.iso.date()]).default(""),
  lifecycleReason: z.string().trim().max(500).default(""),
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

/** Lo que reciben los comandos: los valores por defecto (estado, publicación, fechas) los aplica `toValues`. */
export type CommitteeInput = z.input<typeof committeeInputSchema>;

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
  if (params.status === "ACTIVE" || params.status === "INACTIVE" || params.status === "ON_TRIAL") {
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
  Array<{
    id: string;
    slug: string;
    name: string;
    status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
    trialEndsOn: string | null;
  }>
> {
  return getDb()
    .select({
      id: committee.id,
      slug: committee.slug,
      name: committee.name,
      status: committee.status,
      trialEndsOn: committee.trialEndsOn,
    })
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

const isPublic = and(
  inArray(committee.status, ["ACTIVE", "ON_TRIAL"]),
  eq(committee.publicationStatus, "PUBLISHED"),
);

export const listPublishedCommittees = cache(async (): Promise<PublicCommittee[]> => {
  return getDb().select(publicColumns).from(committee).where(isPublic).orderBy(asc(committee.name));
});

/** Organizadores de una edición: nombre y logo; solo los publicados enlazan a su ficha. */
export interface CommitteeRef {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  isPublished: boolean;
}

export const listCommitteesByIds = cache(async (ids: string[]): Promise<CommitteeRef[]> => {
  if (ids.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select({
      id: committee.id,
      slug: committee.slug,
      name: committee.name,
      logoKey: committee.logoKey,
      status: committee.status,
      publicationStatus: committee.publicationStatus,
    })
    .from(committee)
    .where(inArray(committee.id, ids))
    .orderBy(asc(committee.name));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoKey: row.logoKey,
    isPublished: row.status !== "INACTIVE" && row.publicationStatus === "PUBLISHED",
  }));
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

function toValues(raw: CommitteeInput) {
  const input = committeeInputSchema.parse(raw);
  return {
    slug: input.slug,
    name: input.name,
    status: input.status,
    color: input.color ?? null,
    logoKey: input.logoKey ?? null,
    presentation: input.presentation ?? null,
    contactUrl: input.contactUrl ?? null,
    publicationStatus: input.publicationStatus,
    trialStartsOn: input.trialStartsOn || null,
    trialEndsOn: input.trialEndsOn || null,
    deactivatedOn: input.deactivatedOn || null,
  };
}

export async function createCommittee(
  ctx: CommandContext,
  input: CommitteeInput,
): Promise<{ id: string }> {
  const values = toValues(input);
  const error = committeeLifecycleError(values, null, input.lifecycleReason ?? "", todayKey());
  if (error) {
    throw new DomainError(t(error));
  }
  try {
    const [row] = await ctx.tx.insert(committee).values(values).returning({ id: committee.id });
    if (!row) {
      throw new Error("No se pudo crear el comité");
    }
    await ctx.audit({
      action: "committee.created",
      entityType: "committee",
      entityId: row.id,
      after: { ...values, lifecycleReason: input.lifecycleReason ?? "" },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "committee_slug_unique")) {
      throw new DomainError(t("T-292"), "slug");
    }
    throw error;
  }
}

/** Lo que la dirección edita de la ficha (ADR-058): publicar y el logo siguen con ADMIN. */
export const committeeProfileSchema = z.object({
  presentation: z.string().trim().max(20_000).default(""),
  contactUrl: z.union([z.literal(""), z.string().trim().url().max(500)]).default(""),
});

export type CommitteeProfileInput = z.infer<typeof committeeProfileSchema>;

export async function updateCommitteeProfile(
  ctx: CommandContext,
  id: string,
  input: CommitteeProfileInput,
): Promise<void> {
  const [before] = await ctx.tx
    .select({ presentation: committee.presentation, contactUrl: committee.contactUrl })
    .from(committee)
    .where(eq(committee.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = {
    presentation: input.presentation || null,
    contactUrl: input.contactUrl || null,
  };
  await ctx.tx.update(committee).set(values).where(eq(committee.id, id));
  await ctx.audit({
    action: "committee.profile-updated",
    entityType: "committee",
    entityId: id,
    before,
    after: values,
  });
}

export async function updateCommittee(
  ctx: CommandContext,
  id: string,
  input: CommitteeInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(committee).where(eq(committee.id, id)).for("update");
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = { ...toValues(input), slug: before.slug }; // la sigla no cambia: es parte de la URL y del logo
  const error = committeeLifecycleError(values, before, input.lifecycleReason ?? "", todayKey());
  if (error) {
    throw new DomainError(t(error));
  }
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
    after: { ...values, lifecycleReason: input.lifecycleReason ?? "" },
  });
}
