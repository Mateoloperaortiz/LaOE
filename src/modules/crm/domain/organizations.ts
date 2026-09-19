import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import {
  createPerson,
  getPeopleByIds,
  getPersonRecord,
  listAllTags,
  normalizePhone,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { organization, organizationContact, organizationTag } from "../schema";

// Organizaciones y contactos (02-crm.md, ADR-037 regla 6): empresas, unidades de EAFIT, grupos
// estudiantiles y otras entidades; sus contactos son personas EXTERNAL que nunca inician sesión.

export type OrganizationRecord = typeof organization.$inferSelect;
export type OrganizationKind = OrganizationRecord["kind"];

export const ORGANIZATION_KINDS = ["COMPANY", "EAFIT_UNIT", "STUDENT_GROUP", "OTHER"] as const;

export const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORGANIZATION_KINDS).default("OTHER"),
  website: z.url().optional(),
  notes: z.string().max(20_000).default(""),
});

export type OrganizationInput = z.infer<typeof organizationInputSchema>;

export const contactInputSchema = z.object({
  personId: z.string().trim().min(1),
  role: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().default(false),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

export const externalContactSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  phone: z.string().trim().max(30).optional(),
  role: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().default(false),
});

export type ExternalContactInput = z.infer<typeof externalContactSchema>;

export interface OrganizationListRow extends OrganizationRecord {
  contactCount: number;
  tagNames: string[];
}

export interface OrganizationListParams {
  q: string;
  kind?: string | undefined;
  tagId?: string | undefined;
  page: number;
  pageSize: number;
}

// La tabla exterior va literal: dentro de una plantilla `sql` las columnas salen sin calificar.
const contactCount =
  sql<number>`(select count(*) from organization_contact oc where oc.organization_id = organization.id)`.mapWith(
    Number,
  );

async function tagsFor(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) {
    return map;
  }
  const [rows, tags] = await Promise.all([
    getDb()
      .select({ organizationId: organizationTag.organizationId, tagId: organizationTag.tagId })
      .from(organizationTag)
      .where(inArray(organizationTag.organizationId, ids)),
    listAllTags(),
  ]);
  const names = new Map(tags.map((item) => [item.id, item.name]));
  for (const row of rows) {
    const name = names.get(row.tagId);
    if (name) {
      map.set(row.organizationId, [...(map.get(row.organizationId) ?? []), name]);
    }
  }
  return map;
}

export async function listOrganizations(
  params: OrganizationListParams,
): Promise<{ rows: OrganizationListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(organization.name, `%${params.q}%`));
  }
  if ((ORGANIZATION_KINDS as readonly string[]).includes(params.kind ?? "")) {
    conditions.push(eq(organization.kind, params.kind as OrganizationKind));
  }
  if (params.tagId) {
    conditions.push(
      sql`exists (select 1 from organization_tag ot where ot.organization_id = organization.id and ot.tag_id = ${params.tagId})`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: organization, contactCount })
      .from(organization)
      .where(where)
      .orderBy(asc(organization.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(organization).where(where),
  ]);
  const tags = await tagsFor(rows.map((item) => item.row.id));
  return {
    rows: rows.map((item) => ({
      ...item.row,
      contactCount: item.contactCount,
      tagNames: tags.get(item.row.id) ?? [],
    })),
    total: total?.n ?? 0,
  };
}

export async function getOrganization(id: string): Promise<OrganizationListRow | null> {
  const [row] = await getDb()
    .select({ row: organization, contactCount })
    .from(organization)
    .where(eq(organization.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const tags = await tagsFor([id]);
  return { ...row.row, contactCount: row.contactCount, tagNames: tags.get(id) ?? [] };
}

export interface ContactView {
  id: string;
  personId: string;
  fullName: string;
  email: string;
  role: string | null;
  isPrimary: boolean;
}

export async function listContacts(organizationId: string): Promise<ContactView[]> {
  const rows = await getDb()
    .select()
    .from(organizationContact)
    .where(eq(organizationContact.organizationId, organizationId))
    .orderBy(desc(organizationContact.isPrimary), asc(organizationContact.createdAt));
  const people = await getPeopleByIds(rows.map((row) => row.personId));
  return rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    fullName: people.get(row.personId)?.fullName ?? "",
    email: people.get(row.personId)?.email ?? "",
    role: row.role,
    isPrimary: row.isPrimary,
  }));
}

/** Organizaciones de las que una persona es contacto (Persona 360 de un externo). */
export async function listOrganizationsOfPerson(
  personId: string,
): Promise<Array<{ id: string; name: string; role: string | null; isPrimary: boolean }>> {
  return getDb()
    .select({
      id: organization.id,
      name: organization.name,
      role: organizationContact.role,
      isPrimary: organizationContact.isPrimary,
    })
    .from(organizationContact)
    .innerJoin(organization, eq(organization.id, organizationContact.organizationId))
    .where(eq(organizationContact.personId, personId))
    .orderBy(asc(organization.name));
}

export async function listOrganizationTagIds(organizationId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ tagId: organizationTag.tagId })
    .from(organizationTag)
    .where(eq(organizationTag.organizationId, organizationId));
  return rows.map((row) => row.tagId);
}

export interface OrganizationRef {
  id: string;
  name: string;
  kind: OrganizationKind;
  contactCount: number;
}

/** Búsqueda por similitud (pg_trgm) para la paleta ⌘K y los buscadores de sujeto. */
export async function searchOrganizations(q: string, limit = 8): Promise<OrganizationRef[]> {
  const rows = await getDb()
    .select({ id: organization.id, name: organization.name, kind: organization.kind, contactCount })
    .from(organization)
    .where(
      or(sql`similarity(${organization.name}, ${q}) > 0.2`, ilike(organization.name, `%${q}%`)),
    )
    .orderBy(sql`similarity(${organization.name}, ${q}) desc`, asc(organization.name))
    .limit(limit);
  return rows;
}

export async function getOrganizationsByIds(ids: string[]): Promise<Map<string, OrganizationRef>> {
  const map = new Map<string, OrganizationRef>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ id: organization.id, name: organization.name, kind: organization.kind, contactCount })
    .from(organization)
    .where(inArray(organization.id, ids));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/** Opciones para selectores (nueva tarjeta, filtros). */
export async function listOrganizationOptions(): Promise<Array<{ id: string; name: string }>> {
  return getDb()
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .orderBy(asc(organization.name));
}

function toValues(input: OrganizationInput) {
  return {
    name: input.name,
    kind: input.kind,
    website: input.website ?? null,
    notes: input.notes,
  };
}

export async function createOrganization(
  ctx: CommandContext,
  input: OrganizationInput,
): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx
      .insert(organization)
      .values({ ...toValues(input), createdById: ctx.actor.personId })
      .returning({ id: organization.id });
    if (!row) {
      throw new Error("No se pudo crear la organización");
    }
    await ctx.audit({
      action: "organization.created",
      entityType: "organization",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "organization_name_unique")) {
      throw new DomainError(t("T-950"), "name");
    }
    throw error;
  }
}

export async function updateOrganization(
  ctx: CommandContext,
  id: string,
  input: OrganizationInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(organization).where(eq(organization.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input);
  try {
    await ctx.tx.update(organization).set(values).where(eq(organization.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "organization_name_unique")) {
      throw new DomainError(t("T-950"), "name");
    }
    throw error;
  }
  await ctx.audit({
    action: "organization.updated",
    entityType: "organization",
    entityId: id,
    before,
    after: values,
  });
}

async function clearPrimary(ctx: CommandContext, organizationId: string): Promise<void> {
  await ctx.tx
    .update(organizationContact)
    .set({ isPrimary: false })
    .where(
      and(
        eq(organizationContact.organizationId, organizationId),
        eq(organizationContact.isPrimary, true),
      ),
    );
}

/** Vincula una persona externa como contacto; el principal es único por organización. */
export async function addContact(
  ctx: CommandContext,
  organizationId: string,
  input: ContactInput,
  /** La persona recién creada en esta transacción no se ve con `getDb()`: quien la creó lo avisa. */
  knownExternal = false,
): Promise<{ id: string }> {
  if (!knownExternal) {
    const who = await getPersonRecord(input.personId);
    if (!who) {
      throw new DomainError(t("T-032"), "personId");
    }
    if (who.kind !== "EXTERNAL") {
      throw new DomainError(t("T-956"), "personId");
    }
  }
  if (input.isPrimary) {
    await clearPrimary(ctx, organizationId);
  }
  try {
    const [row] = await ctx.tx
      .insert(organizationContact)
      .values({
        organizationId,
        personId: input.personId,
        role: input.role?.trim() ? input.role.trim() : null,
        isPrimary: input.isPrimary,
      })
      .returning({ id: organizationContact.id });
    if (!row) {
      throw new Error("No se pudo agregar el contacto");
    }
    await ctx.audit({
      action: "organization.contact-added",
      entityType: "organization",
      entityId: organizationId,
      after: { personId: input.personId, role: input.role ?? null, isPrimary: input.isPrimary },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "organization_contact_unique")) {
      throw new DomainError(t("T-957"), "personId");
    }
    throw error;
  }
}

/** Crea la persona externa y la vincula en la misma transacción. */
export async function createExternalContact(
  ctx: CommandContext,
  organizationId: string,
  input: ExternalContactInput,
): Promise<{ id: string; personId: string }> {
  const created = await createPerson(ctx, {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    kind: "EXTERNAL",
    ...(input.phone ? { phone: normalizePhone(input.phone).value } : {}),
  });
  const contact = await addContact(
    ctx,
    organizationId,
    { personId: created.id, role: input.role, isPrimary: input.isPrimary },
    true,
  );
  return { id: contact.id, personId: created.id };
}

export async function removeContact(
  ctx: CommandContext,
  organizationId: string,
  personId: string,
): Promise<boolean> {
  const deleted = await ctx.tx
    .delete(organizationContact)
    .where(
      and(
        eq(organizationContact.organizationId, organizationId),
        eq(organizationContact.personId, personId),
      ),
    )
    .returning({ id: organizationContact.id });
  if (deleted.length > 0) {
    await ctx.audit({
      action: "organization.contact-removed",
      entityType: "organization",
      entityId: organizationId,
      after: { personId },
    });
  }
  return deleted.length > 0;
}

export async function setPrimaryContact(
  ctx: CommandContext,
  organizationId: string,
  personId: string,
): Promise<void> {
  await clearPrimary(ctx, organizationId);
  await ctx.tx
    .update(organizationContact)
    .set({ isPrimary: true })
    .where(
      and(
        eq(organizationContact.organizationId, organizationId),
        eq(organizationContact.personId, personId),
      ),
    );
  await ctx.audit({
    action: "organization.primary-set",
    entityType: "organization",
    entityId: organizationId,
    after: { personId },
  });
}

/** Deja las etiquetas de la organización exactamente como dice la lista. */
export async function setOrganizationTags(
  ctx: CommandContext,
  organizationId: string,
  tagIds: string[],
): Promise<void> {
  const wanted = [...new Set(tagIds)];
  await ctx.tx.delete(organizationTag).where(eq(organizationTag.organizationId, organizationId));
  if (wanted.length > 0) {
    await ctx.tx
      .insert(organizationTag)
      .values(wanted.map((tagId) => ({ organizationId, tagId })))
      .onConflictDoNothing();
  }
  await ctx.audit({
    action: "organization.tags-set",
    entityType: "organization",
    entityId: organizationId,
    after: wanted,
  });
}

// Wrappers con transacción para las páginas.

export function createOrganizationAs(
  actor: Actor,
  input: OrganizationInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createOrganization(ctx, input));
}

export function updateOrganizationAs(
  actor: Actor,
  id: string,
  input: OrganizationInput,
): Promise<void> {
  return runCommand(actor, (ctx) => updateOrganization(ctx, id, input));
}

export function addContactAs(
  actor: Actor,
  organizationId: string,
  input: ContactInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addContact(ctx, organizationId, input));
}

export function createExternalContactAs(
  actor: Actor,
  organizationId: string,
  input: ExternalContactInput,
): Promise<{ id: string; personId: string }> {
  return runCommand(actor, (ctx) => createExternalContact(ctx, organizationId, input));
}

export function removeContactAs(
  actor: Actor,
  organizationId: string,
  personId: string,
): Promise<boolean> {
  return runCommand(actor, (ctx) => removeContact(ctx, organizationId, personId));
}

export function setPrimaryContactAs(
  actor: Actor,
  organizationId: string,
  personId: string,
): Promise<void> {
  return runCommand(actor, (ctx) => setPrimaryContact(ctx, organizationId, personId));
}

export function setOrganizationTagsAs(
  actor: Actor,
  organizationId: string,
  tagIds: string[],
): Promise<void> {
  return runCommand(actor, (ctx) => setOrganizationTags(ctx, organizationId, tagIds));
}
