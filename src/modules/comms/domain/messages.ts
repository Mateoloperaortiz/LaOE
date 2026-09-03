import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { message } from "../schema";

// Lo enviado a una persona (pestaña Comunicaciones de la Persona 360 y "mis datos").

export interface MessageView {
  id: string;
  channel: (typeof message.$inferSelect)["channel"];
  subject: string;
  status: (typeof message.$inferSelect)["status"];
  provider: string;
  sentAt: Date | null;
  createdAt: Date;
}

export async function listMessagesFor(personId: string, limit = 100): Promise<MessageView[]> {
  return getDb()
    .select({
      id: message.id,
      channel: message.channel,
      subject: message.subject,
      status: message.status,
      provider: message.provider,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(eq(message.personId, personId))
    .orderBy(desc(message.createdAt))
    .limit(limit);
}
