import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { message } from "../schema";

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
