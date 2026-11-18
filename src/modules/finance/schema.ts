import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { boardApprovalStatus } from "@/db/enums";
import { eventEdition } from "@/modules/events/schema";
import { committee, person } from "@/modules/people/schema";

// Presupuesto del comité (ADR-059 con las enmiendas de ADR-060 regla 12): presupuesto ordinario anual
// o extraordinario, aprobado por Desarrollo Estudiantil y la Vicepresidencia Financiera antes de
// abrirse (Regl. art. 51), rubros, presolicitud mensual (Est. art. 38.3), aval de evento (Regl. art.
// 35 par. 1), gastos y traslados ligados al aval. Montos en pesos con dos decimales.

/** Lo que la VP recibió, incluso si después cambia el nombre o desaparece un rubro. */
export type BudgetProposal =
  | {
      kind: "PURCHASE";
      lineId: string;
      lineName: string;
      plannedOn: string;
      amount: number;
      description: string;
      supplier: string;
      approvalId?: string;
      eventTitle?: string;
    }
  | {
      kind: "TRANSFER";
      fromLineId: string;
      fromName: string;
      toLineId: string;
      toName: string;
      amount: number;
      reason: string;
      approvalId: string;
      eventTitle: string;
      eventOn: string;
    }
  | {
      kind: "EXTRAORDINARY";
      title: string;
      submittedOn: string;
      notes: string;
      lines: { id: string; name: string; assigned: number }[];
    };

export const budgetKind = pgEnum("budget_kind", ["ORDINARY", "EXTRAORDINARY"]);
export const CONTRACT_FILE_SLOTS = ["contract", "legal", "coordinator"] as const;
export type ContractFileSlot = (typeof CONTRACT_FILE_SLOTS)[number];
export type ContractFiles = Record<ContractFileSlot, { name: string; digest: string }>;
export const budgetStatus = pgEnum("budget_status", ["DRAFT", "OPEN", "CLOSED"]);
export const eventApprovalStatus = pgEnum("event_approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "RETURNED",
]);
// Semáforo de riesgo reputacional del aval (ADR-197 regla 2): lo declara el comité y la Presidencia lo
// puede cambiar.
export const eventRiskLevel = pgEnum("event_risk_level", ["GREEN", "YELLOW", "RED"]);
export const eventApprovalEntryKind = pgEnum("event_approval_entry_kind", [
  "SUBMITTED",
  "RETURNED",
  "RISK_CHANGED",
]);

const money = () => numeric({ precision: 12, scale: 2, mode: "number" });

export const financeContract = pgTable(
  "finance_contract",
  {
    id: id(),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    title: text().notNull(),
    supplier: text().notNull(),
    amount: money().notNull(),
    files: jsonb().$type<ContractFiles>().notNull(),
    requestedById: text().references(() => person.id, { onDelete: "set null" }),
    requestedAt: createdAt(),
    status: boardApprovalStatus().notNull().default("PENDING"),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    decidedSeat: text().$type<"PRESIDENT" | "VP_FINANCE">(),
    decisionNote: text().notNull().default(""),
  },
  (t) => [
    index("finance_contract_committee_idx").on(t.committeeId, t.requestedAt),
    index("finance_contract_queue_idx").on(t.status, t.requestedAt),
    check("finance_contract_amount", sql`${t.amount} > 0`),
    check(
      "finance_contract_files",
      sql`jsonb_typeof(${t.files}) = 'object' and ${t.files} ?& array['contract','legal','coordinator']`,
    ),
    check(
      "finance_contract_decision",
      sql`(${t.status} = 'PENDING' and ${t.decidedAt} is null and ${t.decidedSeat} is null) or (${t.status} <> 'PENDING' and ${t.decidedAt} is not null and ${t.decidedSeat} is not null and ${t.decidedSeat} in ('PRESIDENT','VP_FINANCE'))`,
    ),
  ],
);

export const committeeBudget = pgTable(
  "committee_budget",
  {
    id: id(),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    year: integer().notNull(),
    kind: budgetKind().notNull().default("ORDINARY"),
    /** Actividad no prevista que cubre un extraordinario (Regl. art. 51.2); vacío en el ordinario. */
    title: text().notNull().default(""),
    status: budgetStatus().notNull().default("DRAFT"),
    notes: text().notNull().default(""),
    /** Cuándo lo presentó el comité (Regl. art. 51.1 y 66). */
    submittedOn: date({ mode: "string" }),
    studentDevelopmentApprovedOn: date({ mode: "string" }),
    vpFinanceApprovedOn: date({ mode: "string" }),
    /** Sanción por presentación tardía (Regl. art. 67): descuento sobre lo asignado, con motivo. */
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

// Aval de evento (Regl. art. 36 par. 1; Est. art. 23.11 y 36.3): lo pide el comité y lo decide la
// Presidencia antes de ejecutar, difundir o comprar; los gastos y traslados del evento se ligan aquí.
// La Presidencia lo puede devolver con comentarios y el comité envía una versión nueva (ADR-197 regla
// 1): la fila guarda la versión vigente y `event_approval_entry`, la historia.
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
    /** La versión vigente: sube cada vez que el comité reenvía un aval devuelto. */
    version: integer().notNull().default(1),
    /** Nulo solo en los avales pedidos antes del semáforo. */
    riskLevel: eventRiskLevel(),
    riskJustification: text().notNull().default(""),
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
      sql`(${t.status}::text in ('APPROVED', 'REJECTED')) = (${t.decidedAt} is not null)`,
    ),
    check("event_approval_version_positive", sql`${t.version} >= 1`),
  ],
);

// La historia del aval (ADR-197 regla 1): cada versión enviada con lo que decía, cada devolución con sus
// comentarios y cada cambio de semáforo con su motivo. Solo se agrega.
export const eventApprovalEntry = pgTable(
  "event_approval_entry",
  {
    id: id(),
    approvalId: text()
      .notNull()
      .references(() => eventApproval.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    kind: eventApprovalEntryKind().notNull(),
    /** Lo que decía la versión enviada; vacío en las devoluciones y los cambios de semáforo. */
    title: text().notNull().default(""),
    description: text().notNull().default(""),
    eventOn: date({ mode: "string" }),
    /** El nivel declarado en una versión, o el nuevo en un cambio de semáforo. */
    riskLevel: eventRiskLevel(),
    riskJustification: text().notNull().default(""),
    /** Los comentarios de una devolución o el motivo de un cambio de semáforo. */
    note: text().notNull().default(""),
    authorId: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("event_approval_entry_approval_idx").on(t.approvalId, t.createdAt),
    check(
      "event_approval_entry_submitted_snapshot",
      sql`${t.kind}::text <> 'SUBMITTED' or ${t.eventOn} is not null`,
    ),
    check(
      "event_approval_entry_risk_changed_level",
      sql`${t.kind}::text <> 'RISK_CHANGED' or ${t.riskLevel} is not null`,
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
    /** Proveedor de la lista de la Universidad (Regl. art. 52): dato, no validación. */
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

/** Propuesta y decisión de la VP, con el movimiento que se registró a partir del aval. */
export const budgetApproval = pgTable(
  "budget_approval",
  {
    id: id(),
    budgetId: text()
      .notNull()
      .references(() => committeeBudget.id, { onDelete: "cascade" }),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    year: integer().notNull(),
    proposal: jsonb().$type<BudgetProposal>().notNull(),
    status: boardApprovalStatus().notNull().default("PENDING"),
    requestedById: text().references(() => person.id, { onDelete: "set null" }),
    requestedAt: createdAt(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    decidedAs: text(),
    decisionNote: text().notNull().default(""),
    transferId: text().references(() => budgetTransfer.id),
    expenseId: text().references(() => budgetExpense.id),
  },
  (t) => [
    index("budget_approval_queue_idx").on(t.status, t.requestedAt),
    index("budget_approval_budget_idx").on(t.budgetId, t.committeeId, t.requestedAt),
    uniqueIndex("budget_approval_transfer_unique").on(t.transferId),
    uniqueIndex("budget_approval_expense_unique").on(t.expenseId),
    check(
      "budget_approval_kind",
      sql`${t.proposal}->>'kind' in ('TRANSFER','EXTRAORDINARY','PURCHASE')`,
    ),
    check(
      "budget_approval_purchase_paid",
      sql`${t.expenseId} is null or (${t.status} = 'APPROVED' and ${t.proposal}->>'kind' = 'PURCHASE')`,
    ),
    check("budget_approval_decision", sql`(${t.status} = 'PENDING') = (${t.decidedAt} is null)`),
    check(
      "budget_approval_authority",
      sql`(${t.status} = 'PENDING' and ${t.decidedAs} is null) or (${t.status} <> 'PENDING' and ${t.decidedAs} is not null and ${t.decidedAs} in ('HOLDER','PRESIDENCY'))`,
    ),
    check(
      "budget_approval_posted",
      sql`(${t.status} = 'APPROVED' and ${t.proposal}->>'kind' = 'TRANSFER') = (${t.transferId} is not null)`,
    ),
  ],
);
