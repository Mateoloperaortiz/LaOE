import { sql } from "drizzle-orm";
import { boolean, check, date, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";

// El término académico es el reloj universal del sistema (ADR-004).
export const pointSeparationPolicy = pgTable(
  "point_separation_policy",
  { id: text().primaryKey(), firstTermCode: text().notNull() },
  (t) => [
    check("point_separation_policy_singleton", sql`${t.id} = 'GH_GAMER'`),
    check("point_separation_policy_term_code", sql`${t.firstTermCode} ~ '^[0-9]{4}-[12]$'`),
  ],
);

export const term = pgTable(
  "term",
  {
    id: id(),
    code: text().notNull(), // 2026-2
    semester: integer().notNull(), // 1 o 2, derivado del código
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    pointsClosedAt: timestampTz(),
    // Se fija en la transición de GH/juegos y no cambia al editar las fechas del término.
    gamePointsSeparated: boolean().notNull().default(true),
    permanenceClosedAt: timestampTz(), // se estampa al aplicar el cierre de permanencia (ADR-036)
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
