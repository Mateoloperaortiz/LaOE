import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";

// Los pronósticos del Athletic (ADR-197 regla 7 y su precisión): quien lidera el Athletic crea los
// pronósticos de un partido, cada uno con sus opciones; quien registró su asistencia apuesta GH Points
// hasta que el partido empieza, sola o en parley (varias del mismo partido), con un tope por partido
// que fija Gestión Humana. Se paga por bolsa. Lo apostado y lo ganado van al libro de GH Points.

export const predictionMarketStatus = pgEnum("prediction_market_status", [
  "DRAFT",
  "OPEN",
  "RESOLVED",
  "CANCELLED",
]);
export const predictionTicketStatus = pgEnum("prediction_ticket_status", [
  "OPEN",
  "WON",
  "LOST",
  "REFUNDED",
]);

export const predictionMarket = pgTable(
  "prediction_market",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    title: text().notNull(),
    status: predictionMarketStatus().notNull().default("DRAFT"),
    winningOptionId: text(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    resolvedById: text().references(() => person.id, { onDelete: "set null" }),
    resolvedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("prediction_market_occasion_idx").on(t.occasionId),
    check(
      "prediction_market_resolved_consistent",
      sql`(${t.status}::text = 'RESOLVED') = (${t.winningOptionId} is not null)`,
    ),
  ],
);

export const predictionOption = pgTable(
  "prediction_option",
  {
    id: id(),
    marketId: text()
      .notNull()
      .references(() => predictionMarket.id, { onDelete: "cascade" }),
    label: text().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index("prediction_option_market_idx").on(t.marketId, t.sortOrder)],
);

/** Un pronóstico de una persona: con una sola elección es sencillo; con varias, un parley. */
export const predictionTicket = pgTable(
  "prediction_ticket",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    stake: integer().notNull(),
    status: predictionTicketStatus().notNull().default("OPEN"),
    payout: integer(),
    settledAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("prediction_ticket_occasion_idx").on(t.occasionId, t.status),
    index("prediction_ticket_person_idx").on(t.personId, t.createdAt),
    check("prediction_ticket_stake_positive", sql`${t.stake} > 0`),
    check(
      "prediction_ticket_settled_consistent",
      sql`(${t.status}::text = 'OPEN') = (${t.settledAt} is null)`,
    ),
  ],
);

export const predictionPick = pgTable(
  "prediction_pick",
  {
    id: id(),
    ticketId: text()
      .notNull()
      .references(() => predictionTicket.id, { onDelete: "cascade" }),
    marketId: text()
      .notNull()
      .references(() => predictionMarket.id, { onDelete: "cascade" }),
    optionId: text()
      .notNull()
      .references(() => predictionOption.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("prediction_pick_ticket_market_unique").on(t.ticketId, t.marketId),
    index("prediction_pick_market_idx").on(t.marketId),
  ],
);

/** El tope por persona y por partido, que fija Gestión Humana: una sola fila. */
export const predictionSettings = pgTable(
  "prediction_settings",
  {
    id: text().primaryKey(),
    matchCap: integer().notNull(),
    updatedById: text().references(() => person.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [check("prediction_settings_cap_positive", sql`${t.matchCap} > 0`)],
);
