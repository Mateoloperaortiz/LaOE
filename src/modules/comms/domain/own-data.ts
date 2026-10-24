import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import { campaignRecipient, message, pushDelivery } from "../schema";

/** El historial propio usa su tope declarado, independiente de la pestaña de cien mensajes. */
export async function collectOwnCommsData(personId: string) {
  const db = getDb();
  const [messages, campaignRecipients, pushDeliveries] = await Promise.all([
    db
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
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: campaignRecipient.id,
        campaignId: campaignRecipient.campaignId,
        status: campaignRecipient.status,
        skipReason: campaignRecipient.skipReason,
        sentAt: campaignRecipient.sentAt,
        createdAt: campaignRecipient.createdAt,
      })
      .from(campaignRecipient)
      .where(eq(campaignRecipient.personId, personId))
      .orderBy(desc(campaignRecipient.createdAt), desc(campaignRecipient.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: pushDelivery.id,
        messageId: pushDelivery.messageId,
        status: pushDelivery.status,
        retryable: pushDelivery.retryable,
        sentAt: pushDelivery.sentAt,
        createdAt: pushDelivery.createdAt,
      })
      .from(pushDelivery)
      .innerJoin(message, eq(message.id, pushDelivery.messageId))
      .where(eq(message.personId, personId))
      .orderBy(desc(pushDelivery.createdAt), desc(pushDelivery.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  return ownDataCollections({ messages, campaignRecipients, pushDeliveries });
}
