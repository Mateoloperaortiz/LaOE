import { sql } from "drizzle-orm";
import { check, date, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";

// El término académico es el reloj universal del sistema (ADR-004).
export const term = pgTable(
  "term",
  {
    id: id(),
    code: text().notNull(), // 2026-2
    semester: integer().notNull(), // 1 o 2, derivado del código
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    pointsClosedAt: timestampTz(),
    requiredOrdinaryAssemblies: integer().notNull().default(1),
    permanenceGeneralNominal: integer().notNull().default(50),
    permanenceCommitteeNominal: integer().notNull().default(60),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("term_code_unique").on(t.code),
    check("term_code_format", sql`${t.code} ~ '^[0-9]{4}-[12]$'`),
    check("term_semester_valid", sql`${t.semester} in (1, 2)`),
    check("term_dates_ordered", sql`${t.startsOn} < ${t.endsOn}`),
  ],
);
