import { index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz } from "@/db/columns";
import { person } from "@/modules/people/schema";

// Registro de todo envío a una persona (03-modelo-de-datos.md, comms). Las campañas llegan en la fase 6.

export const messageChannel = pgEnum("message_channel", ["EMAIL", "PUSH"]);
export const messageStatus = pgEnum("message_status", ["SENT", "FAILED"]);

export const message = pgTable(
  "message",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    channel: messageChannel().notNull(),
    campaignId: text(),
    subject: text().notNull(),
    status: messageStatus().notNull(),
    provider: text().notNull(), // console, resend, ses, webpush
    providerId: text(),
    error: text(),
    sentAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("message_person_idx").on(t.personId, t.createdAt),
    index("message_provider_idx").on(t.provider, t.createdAt),
  ],
);
