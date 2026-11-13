import { and, count, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { inboxItem } from "../schema";
import { unlessAnonymized } from "./unless-anonymized";

// El centro de avisos de Mi OE (ADR-166): lo que le llegó a la persona por el bus de notificaciones o
// por una campaña, para volver a leerlo. Lo escriben `deliverNotification` y el lote de campañas; lo
// leen «Hoy» (la campana) y `/app/avisos`; lo borran la limpieza a los 90 días y la anonimización.

export const INBOX_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Lo que se guarda de un texto: un correo largo no llena la tabla. */
export const INBOX_BODY_MAX = 4000;
export const INBOX_PAGE_SIZE = 50;

/** Los tipos de un aviso: los de `message_kind` (ADR-166 regla 1). */
export type InboxKind =
  | "ANNOUNCEMENT"
  | "REMINDER"
  | "SURVEY"
  | "WORDLE"
  | "GAMER_STREAK"
  | "POINTS"
  | "TRANSACTIONAL"
  | "CAMPAIGN";

/** Los filtros de `/app/avisos` en el orden de T-4886 (ADR-166 regla 5). */
export const INBOX_FILTER_KEYS = [
  "cartelera",
  "recordatorios",
  "juegos",
  "puntos",
  "tramites",
  "campanas",
] as const;

export type InboxFilter = (typeof INBOX_FILTER_KEYS)[number];

/** Qué tipos reúne cada filtro. */
export const INBOX_FILTERS: Record<InboxFilter, readonly InboxKind[]> = {
  cartelera: ["ANNOUNCEMENT"],
  recordatorios: ["REMINDER", "SURVEY"],
  juegos: ["WORDLE", "GAMER_STREAK"],
  puntos: ["POINTS"],
  tramites: ["TRANSACTIONAL"],
  campanas: ["CAMPAIGN"],
};

/** El filtro al que pertenece un tipo: la etiqueta que lleva cada aviso en la lista. */
export function kindFilter(kind: InboxKind): InboxFilter {
  return INBOX_FILTER_KEYS.find((key) => INBOX_FILTERS[key].includes(kind)) ?? "tramites";
}

export interface InboxEntry {
  kind: InboxKind;
  title: string;
  body: string;
  href: string | null;
  dedupeKey: string;
}

export interface InboxRow {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Un enlace del aviso solo si es un camino de la casa: nunca otro dominio. */
export function inboxHref(url: string | null | undefined): string | null {
  return url?.startsWith("/") && !url.startsWith("//") ? url : null;
}

/**
 * Guarda el aviso de una persona, una sola vez por clave, si no fue anonimizada (ADR-166 regla 1): con
 * el mismo candado que retiene a la persona mientras sale un push (ADR-116 regla 9), para que una
 * anonimización que llegue a la vez lo encuentre y se lo lleve.
 */
export async function recordInbox(personId: string, entry: InboxEntry): Promise<boolean> {
  const written = await unlessAnonymized(personId, async (tx) => {
    const rows = await tx
      .insert(inboxItem)
      .values({
        personId,
        kind: entry.kind,
        title: entry.title,
        body: entry.body.slice(0, INBOX_BODY_MAX),
        href: inboxHref(entry.href),
        dedupeKey: entry.dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: inboxItem.id });
    return rows.length > 0;
  });
  return written ?? false;
}

/** Los avisos de la persona, del más nuevo al más viejo, con el filtro si lo hay. */
export async function listInbox(
  personId: string,
  filter: InboxFilter | null,
  limit = INBOX_PAGE_SIZE,
): Promise<InboxRow[]> {
  const rows = await getDb()
    .select({
      id: inboxItem.id,
      kind: inboxItem.kind,
      title: inboxItem.title,
      body: inboxItem.body,
      href: inboxItem.href,
      readAt: inboxItem.readAt,
      createdAt: inboxItem.createdAt,
    })
    .from(inboxItem)
    .where(
      and(
        eq(inboxItem.personId, personId),
        filter ? inArray(inboxItem.kind, [...INBOX_FILTERS[filter]]) : undefined,
      ),
    )
    .orderBy(desc(inboxItem.createdAt), desc(inboxItem.id))
    .limit(limit);
  return rows as InboxRow[];
}

/** Cuántos avisos sin leer tiene la persona: el número de la campana. */
export async function countUnreadInbox(personId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(inboxItem)
    .where(and(eq(inboxItem.personId, personId), isNull(inboxItem.readAt)));
  return row?.n ?? 0;
}

/**
 * Marca leído un aviso de la persona y devuelve su enlace. Solo toca un aviso suyo: el de otra persona
 * no se encuentra (ADR-072 regla 1).
 */
export async function openInboxItem(
  personId: string,
  itemId: string,
  now = new Date(),
): Promise<{ href: string | null } | null> {
  const db = getDb();
  const [row] = await db
    .select({ href: inboxItem.href, readAt: inboxItem.readAt })
    .from(inboxItem)
    .where(and(eq(inboxItem.id, itemId), eq(inboxItem.personId, personId)));
  if (!row) {
    return null;
  }
  if (!row.readAt) {
    await db
      .update(inboxItem)
      .set({ readAt: now })
      .where(and(eq(inboxItem.id, itemId), eq(inboxItem.personId, personId)));
  }
  return { href: row.href };
}

/** «Marcar todo como leído»: solo lo de la persona y solo lo que seguía sin leer. */
export async function markInboxRead(personId: string, now = new Date()): Promise<number> {
  const rows = await getDb()
    .update(inboxItem)
    .set({ readAt: now })
    .where(and(eq(inboxItem.personId, personId), isNull(inboxItem.readAt)))
    .returning({ id: inboxItem.id });
  return rows.length;
}

/** La limpieza diaria (ADR-166 regla 3): borra lo que llegó hace más de 90 días, leído o no. */
export async function pruneInbox(now = new Date(), exec: Executor = getDb()): Promise<number> {
  const rows = await exec
    .delete(inboxItem)
    .where(lt(inboxItem.createdAt, new Date(now.getTime() - INBOX_RETENTION_DAYS * DAY_MS)))
    .returning({ id: inboxItem.id });
  return rows.length;
}

/** Al anonimizar a la persona se van todos sus avisos (ADR-166 regla 7). */
export async function deleteInboxFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(inboxItem)
    .where(eq(inboxItem.personId, personId))
    .returning({ id: inboxItem.id });
  return rows.length;
}
