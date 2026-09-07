import { integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestampTz } from "@/db/columns";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";

export const walletPlatform = pgEnum("wallet_platform", ["APPLE", "GOOGLE"]);

// La reserva precede al REST de Google: aunque se pierda su respuesta, queda el id que hay que
// reconciliar o limpiar. Las fechas de emisión nulas indican una reserva aún no confirmada.
export const walletPass = pgTable(
  "wallet_pass",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    platform: walletPlatform().notNull(),
    externalId: text().notNull(),
    walletEpoch: integer().notNull(),
    tokenRevision: integer().notNull(),
    renderedTermId: text().references(() => term.id, { onDelete: "set null" }),
    issuedAt: timestampTz(),
    lastIssuedAt: timestampTz(),
    lastRefreshedAt: timestampTz(),
    revokedAt: timestampTz(),
  },
  (t) => [uniqueIndex("wallet_pass_person_platform_unique").on(t.personId, t.platform)],
);
