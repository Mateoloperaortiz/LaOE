import { and, count, desc, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getPeopleByIds, searchPeople } from "@/modules/people";
import { campaign, message } from "../schema";

// Lo enviado a una persona (pestaña Comunicaciones de la Persona 360 y "mis datos") y el registro
// que escribe cada envío (ADR-038 regla 2: una fila por persona y notificación).

export type MessageKind = (typeof message.$inferSelect)["kind"];
export type MessageChannel = (typeof message.$inferSelect)["channel"];
export type MessageStatus = (typeof message.$inferSelect)["status"];

export interface MessageView {
  id: string;
  channel: MessageChannel;
  kind: MessageKind;
  subject: string;
  status: MessageStatus;
  provider: string;
  campaignId: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export async function listMessagesFor(personId: string, limit = 100): Promise<MessageView[]> {
  return getDb()
    .select({
      id: message.id,
      channel: message.channel,
      kind: message.kind,
      subject: message.subject,
      status: message.status,
      provider: message.provider,
      campaignId: message.campaignId,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(eq(message.personId, personId))
    .orderBy(desc(message.createdAt))
    .limit(limit);
}

export interface MessageInsert {
  personId: string;
  channel: MessageChannel;
  kind: MessageKind;
  subject: string;
  status: MessageStatus;
  provider: string;
  providerId?: string | null;
  error?: string | null;
  dedupeKey?: string | null;
  campaignId?: string | null;
  sentAt?: Date | null;
}

/** Registra un envío; con `dedupeKey` no duplica la fila de esa persona (devuelve null si ya existía). */
export async function recordMessage(input: MessageInsert): Promise<string | null> {
  const rows = await getDb()
    .insert(message)
    .values({
      personId: input.personId,
      channel: input.channel,
      kind: input.kind,
      subject: input.subject,
      status: input.status,
      provider: input.provider,
      providerId: input.providerId ?? null,
      error: input.error ?? null,
      dedupeKey: input.dedupeKey ?? null,
      campaignId: input.campaignId ?? null,
      sentAt: input.sentAt ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: message.id });
  return rows[0]?.id ?? null;
}

export interface RecordedMessage {
  id: string;
  status: MessageStatus;
  provider: string;
  providerId: string | null;
  error: string | null;
  sentAt: Date | null;
}

/** El mensaje que ya quedó registrado para esa persona con esa clave, si existe. */
export async function findRecordedMessage(
  personId: string,
  dedupeKey: string,
): Promise<RecordedMessage | null> {
  const [row] = await getDb()
    .select({
      id: message.id,
      status: message.status,
      provider: message.provider,
      providerId: message.providerId,
      error: message.error,
      sentAt: message.sentAt,
    })
    .from(message)
    .where(and(eq(message.personId, personId), eq(message.dedupeKey, dedupeKey)))
    .limit(1);
  return row ?? null;
}

/** Personas que ya tienen un mensaje con esa clave: el bus las salta (idempotencia por persona). */
export async function listAlreadyNotified(
  personIds: string[],
  dedupeKey: string,
): Promise<Set<string>> {
  if (personIds.length === 0) {
    return new Set();
  }
  const rows = await getDb()
    .select({ personId: message.personId })
    .from(message)
    .where(
      and(
        inArray(message.personId, personIds),
        isNotNull(message.dedupeKey),
        eq(message.dedupeKey, dedupeKey),
      ),
    );
  return new Set(rows.map((row) => row.personId));
}

/** Al anonimizar (ADR-030): los mensajes no son historia institucional. */
export async function deleteMessagesFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(message)
    .where(eq(message.personId, personId))
    .returning({ id: message.id });
  return rows.length;
}

// Registro de mensajes del admin (ADR-038 regla 11): cada envío con su persona, canal, tipo y campaña.

export interface MessageAdminRow {
  id: string;
  personId: string;
  personName: string;
  email: string;
  channel: MessageChannel;
  kind: MessageKind;
  subject: string;
  status: MessageStatus;
  provider: string;
  error: string | null;
  campaignId: string | null;
  campaignName: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface MessageListParams {
  q: string;
  channel?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  campaignId?: string | undefined;
  page: number;
  pageSize: number;
}

const CHANNELS = ["EMAIL", "PUSH"] as const;
const KINDS = [
  "TRANSACTIONAL",
  "ANNOUNCEMENT",
  "POINTS",
  "REMINDER",
  "SURVEY",
  "CAMPAIGN",
] as const;
const STATUSES = ["SENT", "FAILED"] as const;

function isOneOf<T extends string>(list: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (list as readonly string[]).includes(value);
}

export async function listMessages(
  params: MessageListParams,
): Promise<{ rows: MessageAdminRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    // Los nombres viven en people: la búsqueda cruza sus coincidencias con el asunto (ADR-001).
    const matches = await searchPeople(params.q, 50);
    const ids = matches.map((item) => item.id);
    const bySubject = ilike(message.subject, `%${params.q}%`);
    conditions.push(ids.length > 0 ? or(bySubject, inArray(message.personId, ids)) : bySubject);
  }
  if (isOneOf(CHANNELS, params.channel)) {
    conditions.push(eq(message.channel, params.channel));
  }
  if (isOneOf(KINDS, params.kind)) {
    conditions.push(eq(message.kind, params.kind));
  }
  if (isOneOf(STATUSES, params.status)) {
    conditions.push(eq(message.status, params.status));
  }
  if (params.campaignId) {
    conditions.push(eq(message.campaignId, params.campaignId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: message.id,
        personId: message.personId,
        channel: message.channel,
        kind: message.kind,
        subject: message.subject,
        status: message.status,
        provider: message.provider,
        error: message.error,
        campaignId: message.campaignId,
        campaignName: campaign.name,
        sentAt: message.sentAt,
        createdAt: message.createdAt,
      })
      .from(message)
      .leftJoin(campaign, eq(campaign.id, message.campaignId))
      .where(where)
      .orderBy(desc(message.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(message).where(where),
  ]);
  const people = await getPeopleByIds([...new Set(rows.map((row) => row.personId))]);
  return {
    rows: rows.map((row) => ({
      ...row,
      personName: people.get(row.personId)?.fullName.trim() ?? "",
      email: people.get(row.personId)?.email ?? "",
    })),
    total: total?.n ?? 0,
  };
}
