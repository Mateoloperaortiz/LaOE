import { and, asc, count, eq, ilike, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { personTag, tag } from "../schema";

// Etiquetas: marcas libres sobre personas; describen, no deciden (02-crm.md).

export type TagRow = typeof tag.$inferSelect;

export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type TagInput = z.infer<typeof tagInputSchema>;

export async function listTags(params: {
  q: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: TagRow[]; total: number }> {
  const where = params.q ? ilike(tag.name, `%${params.q}%`) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(tag)
      .where(where)
      .orderBy(asc(tag.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(tag).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getTag(id: string): Promise<TagRow | null> {
  const [row] = await getDb().select().from(tag).where(eq(tag.id, id)).limit(1);
  return row ?? null;
}

export async function listAllTags(): Promise<TagRow[]> {
  return getDb().select().from(tag).orderBy(asc(tag.name));
}

export async function listPersonTags(personId: string): Promise<TagRow[]> {
  return getDb()
    .select({ id: tag.id, name: tag.name, color: tag.color, createdAt: tag.createdAt })
    .from(personTag)
    .innerJoin(tag, eq(tag.id, personTag.tagId))
    .where(eq(personTag.personId, personId))
    .orderBy(asc(tag.name));
}

export async function createTag(ctx: CommandContext, input: TagInput): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx
      .insert(tag)
      .values({ name: input.name, color: input.color ?? null })
      .returning({ id: tag.id });
    if (!row) {
      throw new Error("No se pudo crear la etiqueta");
    }
    await ctx.audit({ action: "tag.created", entityType: "tag", entityId: row.id, after: input });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "tag_name_unique")) {
      throw new DomainError(t("T-466"), "name");
    }
    throw error;
  }
}

export async function updateTag(ctx: CommandContext, id: string, input: TagInput): Promise<void> {
  const [before] = await ctx.tx.select().from(tag).where(eq(tag.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  try {
    await ctx.tx
      .update(tag)
      .set({ name: input.name, color: input.color ?? null })
      .where(eq(tag.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "tag_name_unique")) {
      throw new DomainError(t("T-466"), "name");
    }
    throw error;
  }
  await ctx.audit({ action: "tag.updated", entityType: "tag", entityId: id, before, after: input });
}

/** Suma etiquetas sin quitar las que ya tiene (acción de un formulario, ADR-037). */
export async function addPersonTags(
  ctx: CommandContext,
  personId: string,
  tagIds: string[],
): Promise<number> {
  const wanted = [...new Set(tagIds)];
  if (wanted.length === 0) {
    return 0;
  }
  const inserted = await ctx.tx
    .insert(personTag)
    .values(wanted.map((tagId) => ({ personId, tagId })))
    .onConflictDoNothing()
    .returning({ tagId: personTag.tagId });
  if (inserted.length > 0) {
    await ctx.audit({
      action: "person.tags-added",
      entityType: "person",
      entityId: personId,
      after: inserted.map((row) => row.tagId),
    });
  }
  return inserted.length;
}

/** Deja las etiquetas de la persona exactamente como dice la lista. */
export async function setPersonTags(
  ctx: CommandContext,
  personId: string,
  tagIds: string[],
): Promise<void> {
  const wanted = [...new Set(tagIds)];
  const current = await ctx.tx
    .select({ tagId: personTag.tagId })
    .from(personTag)
    .where(eq(personTag.personId, personId));
  const currentIds = current.map((row) => row.tagId);
  if (wanted.length === 0) {
    await ctx.tx.delete(personTag).where(eq(personTag.personId, personId));
  } else {
    await ctx.tx
      .delete(personTag)
      .where(and(eq(personTag.personId, personId), notInArray(personTag.tagId, wanted)));
    const missing = wanted.filter((id) => !currentIds.includes(id));
    if (missing.length > 0) {
      await ctx.tx
        .insert(personTag)
        .values(missing.map((tagId) => ({ personId, tagId })))
        .onConflictDoNothing();
    }
  }
  await ctx.audit({
    action: "person.tags-set",
    entityType: "person",
    entityId: personId,
    before: currentIds,
    after: wanted,
  });
}
