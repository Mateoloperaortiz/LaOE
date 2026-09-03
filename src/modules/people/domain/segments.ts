import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  notExists,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { getCurrentTerm } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { committeeMembership, consent, membership, person, personTag, segment } from "../schema";

// Segmentos: filtros guardados que alimentan exportes y, después, campañas (02-crm.md). El filtro se
// valida con Zod al leer; se evalúa en SQL sobre el término actual.

export const segmentFilterSchema = z.object({
  stages: z.array(z.enum(["PROSPECT", "APPLICANT", "MEMBER", "ALUMNI"])).default([]),
  statuses: z.array(z.enum(["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"])).default([]),
  entry: z.enum(["ANY", "NEW", "VETERAN"]).default("ANY"),
  committeeIds: z.array(z.string().min(1)).default([]),
  roleCodes: z.array(z.string().min(1)).default([]),
  tagIds: z.array(z.string().min(1)).default([]),
  consent: z.enum(["ANY", "COMMS_YES", "COMMS_NO", "PHOTO_YES", "MEMORIAL_YES"]).default("ANY"),
  program: z.string().trim().max(120).default(""),
});

export type SegmentFilter = z.infer<typeof segmentFilterSchema>;

export const segmentInputSchema = segmentFilterSchema.extend({
  name: z.string().trim().min(2).max(80),
});

export type SegmentInput = z.infer<typeof segmentInputSchema>;

export interface SegmentRow {
  id: string;
  name: string;
  filter: SegmentFilter;
  count: number;
  createdAt: Date;
}

/** Ids de las personas que cumplen el filtro (comités y cargos en el término actual). */
export async function findPeopleByFilter(filter: SegmentFilter): Promise<string[]> {
  const db = getDb();
  const current = await getCurrentTerm();
  const conditions = [];
  if (filter.stages.length > 0) {
    conditions.push(inArray(person.stage, filter.stages));
  }
  if (filter.statuses.length > 0) {
    conditions.push(inArray(membership.status, filter.statuses));
  }
  if (filter.entry === "NEW") {
    conditions.push(current ? eq(membership.firstTermId, current.id) : sql`false`);
  }
  if (filter.entry === "VETERAN") {
    conditions.push(current ? sql`${membership.firstTermId} <> ${current.id}` : sql`false`);
  }
  if (filter.committeeIds.length > 0 || filter.roleCodes.length > 0) {
    if (!current) {
      return [];
    }
    const inTerm = [
      eq(committeeMembership.personId, person.id),
      eq(committeeMembership.termId, current.id),
      isNull(committeeMembership.leftAt),
    ];
    if (filter.committeeIds.length > 0) {
      inTerm.push(inArray(committeeMembership.committeeId, filter.committeeIds));
    }
    if (filter.roleCodes.length > 0) {
      inTerm.push(inArray(committeeMembership.roleCode, filter.roleCodes));
    }
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(committeeMembership)
          .where(and(...inTerm)),
      ),
    );
  }
  if (filter.tagIds.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(personTag)
          .where(and(eq(personTag.personId, person.id), inArray(personTag.tagId, filter.tagIds))),
      ),
    );
  }
  if (filter.consent !== "ANY") {
    const purpose =
      filter.consent === "PHOTO_YES"
        ? "DIRECTORY_PHOTO"
        : filter.consent === "MEMORIAL_YES"
          ? "MEMORIAL"
          : "COMMUNICATIONS";
    const live = db
      .select({ one: sql`1` })
      .from(consent)
      .where(
        and(
          eq(consent.personId, person.id),
          eq(consent.purpose, purpose),
          isNull(consent.revokedAt),
        ),
      );
    conditions.push(filter.consent === "COMMS_NO" ? notExists(live) : exists(live));
  }
  if (filter.program) {
    conditions.push(ilike(person.program, `%${filter.program}%`));
  }
  conditions.push(isNull(person.anonymizedAt));
  const rows = await db
    .select({ id: person.id })
    .from(person)
    .leftJoin(membership, eq(membership.personId, person.id))
    .where(and(...conditions))
    .orderBy(asc(person.fullName));
  return rows.map((row) => row.id);
}

function parseFilter(raw: unknown): SegmentFilter {
  const parsed = segmentFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : segmentFilterSchema.parse({});
}

async function withCount(row: typeof segment.$inferSelect): Promise<SegmentRow> {
  const filter = parseFilter(row.filter);
  const ids = await findPeopleByFilter(filter);
  return { id: row.id, name: row.name, filter, count: ids.length, createdAt: row.createdAt };
}

export async function listSegments(params: {
  q: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: SegmentRow[]; total: number }> {
  const where = params.q ? ilike(segment.name, `%${params.q}%`) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(segment)
      .where(where)
      .orderBy(desc(segment.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(segment).where(where),
  ]);
  return { rows: await Promise.all(rows.map(withCount)), total: total?.n ?? 0 };
}

export async function getSegment(id: string): Promise<SegmentRow | null> {
  const [row] = await getDb().select().from(segment).where(eq(segment.id, id)).limit(1);
  return row ? withCount(row) : null;
}

export async function listAllSegments(): Promise<Array<{ id: string; name: string }>> {
  return getDb()
    .select({ id: segment.id, name: segment.name })
    .from(segment)
    .orderBy(asc(segment.name));
}

function split(input: SegmentInput): { name: string; filter: SegmentFilter } {
  const { name, ...filter } = input;
  return { name, filter };
}

export async function createSegment(
  ctx: CommandContext,
  input: SegmentInput,
): Promise<{ id: string }> {
  const { name, filter } = split(input);
  const [row] = await ctx.tx
    .insert(segment)
    .values({ name, filter, createdById: ctx.actor.personId })
    .returning({ id: segment.id });
  if (!row) {
    throw new Error("No se pudo crear el segmento");
  }
  await ctx.audit({
    action: "segment.created",
    entityType: "segment",
    entityId: row.id,
    after: { name, filter },
  });
  return row;
}

export async function updateSegment(
  ctx: CommandContext,
  id: string,
  input: SegmentInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(segment).where(eq(segment.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const { name, filter } = split(input);
  await ctx.tx.update(segment).set({ name, filter }).where(eq(segment.id, id));
  await ctx.audit({
    action: "segment.updated",
    entityType: "segment",
    entityId: id,
    before: { name: before.name, filter: before.filter },
    after: { name, filter },
  });
}
