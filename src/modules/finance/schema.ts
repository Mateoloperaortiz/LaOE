import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { eventEdition } from "@/modules/events/schema";
import { committee, person } from "@/modules/people/schema";

// Presupuesto del comité (ADR-059 con las enmiendas de ADR-060 regla 12): presupuesto ordinario anual
// o extraordinario, aprobado por Desarrollo Estudiantil y la Vicepresidencia Financiera antes de
// abrirse (Regl. art. 50), rubros, presolicitud mensual (Est. art. 38.3), aval de evento (Regl. art.
// 35 par. 1), gastos y traslados ligados al aval. Montos en pesos con dos decimales.

export const budgetKind = pgEnum("budget_kind", ["ORDINARY", "EXTRAORDINARY"]);
export const budgetStatus = pgEnum("budget_status", ["DRAFT", "OPEN", "CLOSED"]);
export const eventApprovalStatus = pgEnum("event_approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

const money = () => numeric({ precision: 12, scale: 2, mode: "number" });

export const committeeBudget = pgTable(
  "committee_budget",
  {
    id: id(),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    year: integer().notNull(),
    kind: budgetKind().notNull().default("ORDINARY"),
    /** Actividad no prevista que cubre un extraordinario (Regl. art. 50.2); vacío en el ordinario. */
    title: text().notNull().default(""),
    status: budgetStatus().notNull().default("DRAFT"),
    notes: text().notNull().default(""),
    /** Cuándo lo presentó el comité (Regl. art. 50.1 y 66). */
    submittedOn: date({ mode: "string" }),
    studentDevelopmentApprovedOn: date({ mode: "string" }),
    vpFinanceApprovedOn: date({ mode: "string" }),
    /** Sanción por presentación tardía (Regl. art. 66): descuento sobre lo asignado, con motivo. */
    sanctionPercent: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    sanctionReason: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("committee_budget_ordinary_unique")
      .on(t.committeeId, t.year)
      .where(sql`${t.kind} = 'ORDINARY'`),
    index("committee_budget_committee_idx").on(t.committeeId, t.year),
    check("committee_budget_year_range", sql`${t.year} between 2000 and 2100`),
    check(
      "committee_budget_open_approved",
      sql`${t.status}::text <> 'OPEN' or (${t.studentDevelopmentApprovedOn} is not null and ${t.vpFinanceApprovedOn} is not null)`,
    ),
    check("committee_budget_sanction_range", sql`${t.sanctionPercent} between 0 and 100`),
    check(
      "committee_budget_extraordinary_title",
      sql`${t.kind}::text <> 'EXTRAORDINARY' or ${t.title} <> ''`,
    ),
  ],
);

export const budgetLine = pgTable(
  "budget_line",
  {
    id: id(),
    budgetId: text()
      .notNull()
      .references(() => committeeBudget.id, { onDelete: "cascade" }),
    name: text().notNull(),
    assigned: money().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_line_budget_idx").on(t.budgetId, t.sortOrder),
    check("budget_line_assigned_positive", sql`${t.assigned} >= 0`),
  ],
);

// Aval de evento (Regl. art. 35 par. 1; Est. art. 23.11 y 36.3): lo pide el comité y lo decide la
// Presidencia antes de ejecutar, difundir o comprar; los gastos y traslados del evento se ligan aquí.
export const eventApproval = pgTable(
  "event_approval",
  {
    id: id(),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    budgetId: text().references(() => committeeBudget.id, { onDelete: "set null" }),
    editionId: text().references(() => eventEdition.id, { onDelete: "set null" }),
    title: text().notNull(),
    description: text().notNull().default(""),
    eventOn: date({ mode: "string" }).notNull(),
    status: eventApprovalStatus().notNull().default("PENDING"),
    requestedById: text().references(() => person.id, { onDelete: "set null" }),
    requestedAt: createdAt(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    decisionNote: text().notNull().default(""),
  },
  (t) => [
    index("event_approval_committee_idx").on(t.committeeId, t.status),
    check(
      "event_approval_decided_consistent",
      sql`(${t.status}::text = 'PENDING') = (${t.decidedAt} is null)`,
    ),
  ],
);

// Presolicitud mensual del Financiero (Est. art. 38.3 y par. 1): sin ella no hay acceso ese mes.
export const budgetPrerequest = pgTable(
  "budget_prerequest",
  {
    id: id(),
    budgetId: text()
      .notNull()
      .references(() => committeeBudget.id, { onDelete: "cascade" }),
    month: text().notNull(),
    submittedOn: date({ mode: "string" }).notNull(),
    submittedById: text().references(() => person.id, { onDelete: "set null" }),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("budget_prerequest_month_unique").on(t.budgetId, t.month),
    check("budget_prerequest_month_format", sql`${t.month} ~ '^[0-9]{4}-[0-9]{2}$'`),
  ],
);

export const budgetExpense = pgTable(
  "budget_expense",
  {
    id: id(),
    budgetId: text()
      .notNull()
      .references(() => committeeBudget.id, { onDelete: "cascade" }),
    lineId: text()
      .notNull()
      .references(() => budgetLine.id),
    approvalId: text().references(() => eventApproval.id, { onDelete: "set null" }),
    spentOn: date({ mode: "string" }).notNull(),
    amount: money().notNull(),
    description: text().notNull(),
    /** Proveedor de la lista de la Universidad (Regl. art. 51): dato, no validación. */
    supplier: text().notNull().default(""),
    registeredById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_expense_budget_idx").on(t.budgetId, t.spentOn),
    check("budget_expense_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const budgetTransfer = pgTable(
  "budget_transfer",
  {
    id: id(),
    budgetId: text()
      .notNull()
      .references(() => committeeBudget.id, { onDelete: "cascade" }),
    fromLineId: text()
      .notNull()
      .references(() => budgetLine.id),
    toLineId: text()
      .notNull()
      .references(() => budgetLine.id),
    approvalId: text().references(() => eventApproval.id, { onDelete: "set null" }),
    amount: money().notNull(),
    reason: text().notNull(),
    registeredById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_transfer_budget_idx").on(t.budgetId, t.createdAt),
    check("budget_transfer_amount_positive", sql`${t.amount} > 0`),
    check("budget_transfer_distinct_lines", sql`${t.fromLineId} <> ${t.toLineId}`),
  ],
);
