import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { currentSeatAuthority, getPeopleByIds } from "@/modules/people";
import { tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { institutionalDirectoryEntry, organization, organizationContact } from "../schema";
import { createExternalContact, createOrganization, externalContactSchema } from "./organizations";

// El directorio institucional (ADR-197 regla 3): las personas de la universidad con las que trabaja la
// OE, sobre las organizaciones «Unidad EAFIT» del CRM y sus contactos. Lo edita la Presidencia y lo ve
// toda la OE en Mi OE. Solo lleva datos de trabajo: nombre, cargo, dependencia, funciones y qué
// solicitudes atiende; nunca el correo ni el teléfono. La foto, solo con la autorización de la persona.

const guard = (index: number) => tList("T-5143")[index] ?? "";

async function assertPresidency(ctx: CommandContext) {
  const ok =
    ctx.actor.personId !== null &&
    (await currentSeatAuthority(ctx.actor.personId, "PRESIDENT", ctx.tx)) === "HOLDER";
  if (!ok) throw new DomainError(guard(0));
}

async function assertUnit(ctx: CommandContext, organizationId: string) {
  const [row] = await ctx.tx
    .select({ kind: organization.kind })
    .from(organization)
    .where(eq(organization.id, organizationId));
  if (row?.kind !== "EAFIT_UNIT") throw new DomainError(guard(1));
}

export const unitInputSchema = z.object({ name: z.string().trim().min(2).max(120) });
export type UnitInput = z.input<typeof unitInputSchema>;

/** Una dependencia de la Universidad, como organización «Unidad EAFIT» del CRM. */
export async function createUnit(ctx: CommandContext, raw: UnitInput): Promise<{ id: string }> {
  const input = unitInputSchema.parse(raw);
  await assertPresidency(ctx);
  return createOrganization(ctx, { name: input.name, kind: "EAFIT_UNIT", notes: "" });
}

/** Nombre, correo de trabajo (para no duplicar a la persona en el CRM) y cargo; el correo no se publica. */
export const unitContactInputSchema = externalContactSchema
  .pick({ firstName: true, lastName: true, email: true })
  .extend({ role: z.string().trim().min(2).max(120) });
export type UnitContactInput = z.input<typeof unitContactInputSchema>;

/** Una persona de una dependencia: queda como contacto externo del CRM, con su cargo. */
export async function addUnitContact(
  ctx: CommandContext,
  organizationId: string,
  raw: UnitContactInput,
): Promise<{ id: string }> {
  const input = unitContactInputSchema.parse(raw);
  await assertPresidency(ctx);
  await assertUnit(ctx, organizationId);
  const created = await createExternalContact(ctx, organizationId, { ...input, isPrimary: false });
  return { id: created.id };
}

export const directoryEntryInputSchema = z.object({
  functions: z.string().trim().max(2000).default(""),
  handles: z.string().trim().max(2000).default(""),
  published: z.boolean().default(false),
  photoAuthorized: z.boolean().default(false),
  photoAssetId: z.string().trim().min(1).nullable().default(null),
});
export type DirectoryEntryInput = z.input<typeof directoryEntryInputSchema>;

/** Lo que el directorio dice de una persona; la foto exige su autorización (ADR-197 regla 3). */
export async function saveDirectoryEntry(
  ctx: CommandContext,
  contactId: string,
  raw: DirectoryEntryInput,
  now = new Date(),
): Promise<void> {
  const input = directoryEntryInputSchema.parse(raw);
  await assertPresidency(ctx);
  const [contact] = await ctx.tx
    .select({ organizationId: organizationContact.organizationId })
    .from(organizationContact)
    .where(eq(organizationContact.id, contactId));
  if (!contact) throw new DomainError(guard(1));
  await assertUnit(ctx, contact.organizationId);
  if (input.photoAssetId && !input.photoAuthorized) throw new DomainError(guard(2), "photoAssetId");
  const [before] = await ctx.tx
    .select()
    .from(institutionalDirectoryEntry)
    .where(eq(institutionalDirectoryEntry.contactId, contactId));
  const values = {
    functions: input.functions,
    handles: input.handles,
    published: input.published,
    photoAssetId: input.photoAuthorized ? input.photoAssetId : null,
    photoAuthorizedAt: input.photoAuthorized ? (before?.photoAuthorizedAt ?? now) : null,
    updatedById: ctx.actor.personId,
  };
  await ctx.tx
    .insert(institutionalDirectoryEntry)
    .values({ contactId, ...values })
    .onConflictDoUpdate({ target: institutionalDirectoryEntry.contactId, set: values });
  await ctx.audit({
    action: "directory.entry-saved",
    entityType: "organization_contact",
    entityId: contactId,
    before: before ?? undefined,
    after: values,
  });
}

export interface DirectoryPerson {
  contactId: string;
  fullName: string;
  role: string;
  functions: string;
  handles: string;
  published: boolean;
  photoAssetId: string | null;
  photoAuthorized: boolean;
}

export interface DirectoryUnit {
  id: string;
  name: string;
  people: DirectoryPerson[];
}

/**
 * Las dependencias y su gente. Para Mi OE, solo lo publicado y sin dependencias vacías; para la
 * Presidencia, todo.
 */
export async function listInstitutionalDirectory(
  options: { publishedOnly: boolean } = { publishedOnly: true },
): Promise<DirectoryUnit[]> {
  const db = getDb();
  const units = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.kind, "EAFIT_UNIT"))
    .orderBy(asc(organization.name));
  if (units.length === 0) return [];
  const contacts = await db
    .select({
      contactId: organizationContact.id,
      organizationId: organizationContact.organizationId,
      personId: organizationContact.personId,
      role: organizationContact.role,
      entry: institutionalDirectoryEntry,
    })
    .from(organizationContact)
    .leftJoin(
      institutionalDirectoryEntry,
      eq(institutionalDirectoryEntry.contactId, organizationContact.id),
    )
    .where(
      and(
        inArray(
          organizationContact.organizationId,
          units.map((unit) => unit.id),
        ),
        options.publishedOnly ? eq(institutionalDirectoryEntry.published, true) : undefined,
      ),
    );
  const people = await getPeopleByIds([...new Set(contacts.map((row) => row.personId))]);
  return units
    .map((unit) => ({
      ...unit,
      people: contacts
        .filter((row) => row.organizationId === unit.id)
        .map((row) => ({
          contactId: row.contactId,
          fullName: people.get(row.personId)?.fullName ?? "",
          role: row.role ?? "",
          functions: row.entry?.functions ?? "",
          handles: row.entry?.handles ?? "",
          published: row.entry?.published ?? false,
          photoAssetId: row.entry?.photoAuthorizedAt ? (row.entry.photoAssetId ?? null) : null,
          photoAuthorized: row.entry?.photoAuthorizedAt != null,
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }))
    .filter((unit) => !options.publishedOnly || unit.people.length > 0);
}

export function createUnitAs(actor: Actor, input: UnitInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createUnit(ctx, input));
}

export function addUnitContactAs(
  actor: Actor,
  organizationId: string,
  input: UnitContactInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addUnitContact(ctx, organizationId, input));
}

export function saveDirectoryEntryAs(
  actor: Actor,
  contactId: string,
  input: DirectoryEntryInput,
): Promise<void> {
  return runCommand(actor, (ctx) => saveDirectoryEntry(ctx, contactId, input));
}
