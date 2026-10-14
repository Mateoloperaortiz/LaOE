import { and, desc, eq, max, notInArray, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { getPeopleByIds } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { type InteractionKind, interaction } from "../schema";
import { type PersonScope, scopedPersonId } from "./person-scope";
import type { TimelineEntry } from "./timeline-pure";

// Línea de tiempo de la persona (02-crm.md): automáticas inmutables (por outbox) y notas editables por su autor.

export interface InteractionView {
  id: string;
  kind: InteractionKind;
  occurredAt: Date;
  actorId: string | null;
  actorName: string | null;
  summary: string;
  body: string | null;
  editedAt: Date | null;
  metadata: Record<string, unknown>;
}

/** Qué interacciones se piden: todas, las de un tipo, o las de cualquier tipo salvo los nombrados. */
export type TimelineFilter = "ALL" | InteractionKind | { except: readonly InteractionKind[] };

/**
 * La condición de tipo de un filtro. Va en la consulta, antes del tope: descartar en memoria lo que
 * ya se cortó deja vacía una lista que sí tenía filas más atrás (ADR-121 regla 10).
 */
function kindMatches(filter: TimelineFilter): SQL | undefined {
  if (filter === "ALL") {
    return undefined;
  }
  if (typeof filter === "string") {
    return eq(interaction.kind, filter);
  }
  // Sin tipos que descartar no hay condición que escribir.
  return filter.except.length > 0 ? notInArray(interaction.kind, [...filter.except]) : undefined;
}

export async function listInteractions(
  personId: string,
  filter: TimelineFilter = "ALL",
  limit = 200,
): Promise<InteractionView[]> {
  return listWhere(and(eq(interaction.personId, personId), kindMatches(filter)), limit);
}

/** Línea de tiempo de una organización (ADR-037): notas y movimientos de sus tarjetas. */
export async function listOrganizationInteractions(
  organizationId: string,
  limit = 200,
): Promise<InteractionView[]> {
  return listWhere(eq(interaction.organizationId, organizationId), limit);
}

async function listWhere(where: SQL | undefined, limit: number): Promise<InteractionView[]> {
  const rows = await getDb()
    .select()
    .from(interaction)
    .where(where)
    .orderBy(desc(interaction.occurredAt), desc(interaction.createdAt))
    .limit(limit);
  const people = await getPeopleByIds(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurredAt,
    actorId: row.actorId,
    actorName: row.actorId ? (people.get(row.actorId)?.fullName?.trim() ?? null) : null,
    summary: row.summary,
    body: row.body,
    editedAt: row.editedAt,
    metadata: row.metadata,
  }));
}

/** Inserta la interacción de un evento; con la misma referencia no duplica (el handler es idempotente). */
export async function recordAutomaticInteraction(
  entry: TimelineEntry,
  ref: { refType: string; refId: string },
): Promise<boolean> {
  const inserted = await getDb()
    .insert(interaction)
    .values({
      personId: entry.personId,
      organizationId: entry.organizationId,
      kind: entry.kind,
      actorId: entry.actorId,
      refType: ref.refType,
      refId: ref.refId,
      summary: entry.summary,
      metadata: entry.metadata,
    })
    .onConflictDoNothing()
    .returning({ id: interaction.id });
  return inserted.length > 0;
}

function excerpt(body: string): string {
  const line = body.split("\n").find((item) => item.trim() !== "") ?? "";
  return line.trim().slice(0, 120);
}

export async function addNote(
  ctx: CommandContext,
  personId: string,
  body: string,
): Promise<{ id: string }> {
  return insertNote(ctx, { personId, organizationId: null }, body);
}

/** Nota sobre una organización (ADR-037 regla 6): mismo ciclo que la de una persona. */
export async function addOrganizationNote(
  ctx: CommandContext,
  organizationId: string,
  body: string,
): Promise<{ id: string }> {
  return insertNote(ctx, { personId: null, organizationId }, body);
}

async function insertNote(
  ctx: CommandContext,
  subject: { personId: string | null; organizationId: string | null },
  body: string,
): Promise<{ id: string }> {
  const [row] = await ctx.tx
    .insert(interaction)
    .values({
      personId: subject.personId,
      organizationId: subject.organizationId,
      kind: "NOTE",
      actorId: ctx.actor.personId,
      summary: excerpt(body),
      body,
    })
    .returning({ id: interaction.id });
  if (!row) {
    throw new Error("No se pudo guardar la nota");
  }
  await ctx.audit({
    action: "note.created",
    entityType: "interaction",
    entityId: row.id,
    after: subject,
  });
  return row;
}

/**
 * Solo su autor edita una nota; queda `editedAt` (02-crm.md, regla 3). Se edita desde la ficha de su
 * persona, que es obligatoria (ADR-122 regla 1): la nota de otra persona responde como una que no
 * existe.
 */
export async function editNote(
  ctx: CommandContext,
  id: string,
  body: string,
  scope: PersonScope,
): Promise<void> {
  const personId = scopedPersonId(scope);
  const [row] = await ctx.tx.select().from(interaction).where(eq(interaction.id, id));
  if (!row || row.kind !== "NOTE" || personId === null || row.personId !== personId) {
    throw new DomainError(t("T-032"));
  }
  if (row.actorId !== ctx.actor.personId) {
    throw new DomainError(t("T-517"));
  }
  await ctx.tx
    .update(interaction)
    .set({ body, summary: excerpt(body), editedAt: new Date() })
    .where(eq(interaction.id, id));
  await ctx.audit({
    action: "note.edited",
    entityType: "interaction",
    entityId: id,
    after: { personId: row.personId },
  });
}

export async function latestContact(personId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ at: max(interaction.occurredAt) })
    .from(interaction)
    .where(eq(interaction.personId, personId));
  return row?.at ?? null;
}

/** Anonimización (ADR-030): las notas son datos personales y se borran. */
export async function deleteNotesFor(personId: string): Promise<number> {
  const deleted = await getDb()
    .delete(interaction)
    .where(and(eq(interaction.personId, personId), eq(interaction.kind, "NOTE")))
    .returning({ id: interaction.id });
  return deleted.length;
}
