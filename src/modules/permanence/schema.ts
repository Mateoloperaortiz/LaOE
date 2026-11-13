import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { event, eventEdition } from "@/modules/events/schema";
import { committee, membershipStatus, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import type { ProposalReason } from "./domain/permanence-pure";

// Permanencia (ADR-025 a ADR-028, ADR-036): las tablas de GH y de cada comité como datos por término,
// grupos de trabajo con evaluadores, puntajes del líder, créditos manuales, snapshot por persona y
// decisiones confirmadas del cierre. Los pesos y valores son puntos con dos decimales.

export const permanenceScope = pgEnum("permanence_scope", ["GENERAL", "COMMITTEE"]);
export const permanenceAppliesTo = pgEnum("permanence_applies_to", ["ALL", "NEW", "VETERAN"]);
export const permanenceComputation = pgEnum("permanence_computation", [
  "CHECKIN_COUNT",
  "CHECKIN_THRESHOLD",
  "CHECKIN_RATE",
  "GROUP_EVALUATED",
  "COMPOSITE",
  "LEADER_SCORE",
  "MANUAL",
]);
export const workGroupKind = pgEnum("work_group_kind", [
  "WORK_COMMITTEE",
  "GT_MACROEVENT",
  "GAP",
  "GAP_OE",
  "BARRA_BRAVA",
  "NEW_MEMBER_TASK",
]);
export const workGroupEvaluation = pgEnum("work_group_evaluation", [
  "PENDING",
  "GOOD",
  "INSUFFICIENT",
]);
export const permanenceDecisionKind = pgEnum("permanence_decision_kind", [
  "CONTINUES",
  "PROBATION",
  "EXIT_COMMITTEE",
  "EXIT_OE",
]);

const points = () => numeric({ precision: 6, scale: 2, mode: "number" });

// Un criterio de una tabla (general o de un comité) en un término; `weight` es el máximo que da y
// `params` se valida con el esquema Zod de su `computation` (domain/params.ts).
export const permanenceRule = pgTable(
  "permanence_rule",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    scope: permanenceScope().notNull(),
    committeeId: text().references(() => committee.id),
    key: text().notNull(),
    label: text().notNull(),
    description: text().notNull().default(""),
    weight: points().notNull(),
    appliesTo: permanenceAppliesTo().notNull().default("ALL"),
    computation: permanenceComputation().notNull(),
    params: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("permanence_rule_general_unique")
      .on(t.termId, t.key)
      .where(sql`${t.scope} = 'GENERAL'`),
    uniqueIndex("permanence_rule_committee_unique")
      .on(t.termId, t.committeeId, t.key)
      .where(sql`${t.scope} = 'COMMITTEE'`),
    index("permanence_rule_term_idx").on(t.termId, t.committeeId, t.sortOrder),
    check("permanence_rule_key_format", sql`${t.key} ~ '^[a-z0-9-]{2,40}$'`),
    check("permanence_rule_weight_nonnegative", sql`${t.weight} >= 0`),
    check(
      "permanence_rule_scope_consistent",
      sql`(${t.scope} = 'COMMITTEE') = (${t.committeeId} is not null)`,
    ),
  ],
);

// Bloqueo y comentario de GH por tabla (ADR-026 enmendada): existe solo cuando GH lo escribe.
export const permanenceTable = pgTable(
  "permanence_table",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    scope: permanenceScope().notNull(),
    committeeId: text().references(() => committee.id),
    lockedAt: timestampTz(),
    lockedById: text().references(() => person.id, { onDelete: "set null" }),
    comment: text(),
    commentedById: text().references(() => person.id, { onDelete: "set null" }),
    commentedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("permanence_table_general_unique").on(t.termId).where(sql`${t.scope} = 'GENERAL'`),
    uniqueIndex("permanence_table_committee_unique")
      .on(t.termId, t.committeeId)
      .where(sql`${t.scope} = 'COMMITTEE'`),
    check(
      "permanence_table_scope_consistent",
      sql`(${t.scope} = 'COMMITTEE') = (${t.committeeId} is not null)`,
    ),
  ],
);

// Grupo de trabajo por término: comité de trabajo, GT de macroevento, GAP, GAP OE, barra brava o
// tarea de nuevos. El líder lo opera; los evaluadores evalúan (ADR-028).
export const workGroup = pgTable(
  "work_group",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    kind: workGroupKind().notNull(),
    name: text().notNull(),
    code: text(),
    editionId: text().references(() => eventEdition.id, { onDelete: "set null" }),
    eventId: text().references(() => event.id, { onDelete: "set null" }),
    leaderPersonId: text().references(() => person.id, { onDelete: "set null" }),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("work_group_code_unique").on(t.termId, t.code).where(sql`${t.code} is not null`),
    uniqueIndex("work_group_macroevent_term_unique")
      .on(t.termId, t.eventId)
      .where(sql`${t.kind} = 'GT_MACROEVENT' and ${t.eventId} is not null`),
    uniqueIndex("work_group_gap_macroevent_term_unique")
      .on(t.termId, t.eventId)
      .where(sql`${t.kind} = 'GAP' and ${t.eventId} is not null`),
    index("work_group_term_kind_idx").on(t.termId, t.kind),
    index("work_group_leader_idx").on(t.leaderPersonId),
    check("work_group_code_format", sql`${t.code} is null or ${t.code} ~ '^[A-Z0-9-]{2,20}$'`),
  ],
);

export const workGroupEvaluator = pgTable(
  "work_group_evaluator",
  {
    id: id(),
    groupId: text()
      .notNull()
      .references(() => workGroup.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("work_group_evaluator_unique").on(t.groupId, t.personId),
    index("work_group_evaluator_person_idx").on(t.personId),
  ],
);

// Pertenencia a un grupo con su evaluación: pendiente hasta que el evaluador decide; insuficiente
// lleva observación (la lee la persona).
export const workGroupMembership = pgTable(
  "work_group_membership",
  {
    id: id(),
    groupId: text()
      .notNull()
      .references(() => workGroup.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    joinedAt: timestampTz().notNull().defaultNow(),
    leftAt: timestampTz(),
    areas: text().array().notNull().default(sql`'{}'::text[]`),
    evaluation: workGroupEvaluation().notNull().default("PENDING"),
    evaluatedById: text().references(() => person.id, { onDelete: "set null" }),
    evaluatedAt: timestampTz(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("work_group_membership_unique").on(t.groupId, t.personId),
    index("work_group_membership_person_idx").on(t.personId),
    check(
      "work_group_membership_evaluated_consistent",
      sql`(${t.evaluation} = 'PENDING') = (${t.evaluatedAt} is null)`,
    ),
  ],
);

// Puntaje del líder en un criterio LEADER_SCORE de su tabla (ADR-026): de 0 al peso, con observación si baja.
export const leaderScore = pgTable(
  "leader_score",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    ruleId: text()
      .notNull()
      .references(() => permanenceRule.id, { onDelete: "restrict" }),
    value: points().notNull(),
    note: text(),
    scoredById: text().references(() => person.id, { onDelete: "set null" }),
    scoredAt: timestampTz().notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("leader_score_unique").on(t.ruleId, t.personId),
    index("leader_score_person_term_idx").on(t.personId, t.termId),
    check("leader_score_value_nonnegative", sql`${t.value} >= 0`),
  ],
);

// Crédito manual de GH en un criterio MANUAL, con motivo (ADR-025).
export const manualCredit = pgTable(
  "manual_credit",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    ruleId: text()
      .notNull()
      .references(() => permanenceRule.id, { onDelete: "restrict" }),
    value: points().notNull(),
    reason: text().notNull(),
    grantedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("manual_credit_unique").on(t.ruleId, t.personId),
    index("manual_credit_person_term_idx").on(t.personId, t.termId),
    check("manual_credit_value_nonnegative", sql`${t.value} >= 0`),
  ],
);

export const permanenceBonus = pgTable(
  "permanence_bonus",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    requestId: text().notNull(),
    reason: text().notNull(),
    grantedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("permanence_bonus_request_unique").on(t.personId, t.termId, t.requestId),
    check(
      "permanence_bonus_reason_length",
      sql`char_length(btrim(${t.reason})) between 1 and 1000`,
    ),
  ],
);

export const permanenceBonusAllocation = pgTable(
  "permanence_bonus_allocation",
  {
    bonusId: text()
      .notNull()
      .references(() => permanenceBonus.id, { onDelete: "cascade" }),
    ruleId: text()
      .notNull()
      .references(() => permanenceRule.id, { onDelete: "restrict" }),
    value: points().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bonusId, t.ruleId] }),
    index("permanence_bonus_allocation_rule_idx").on(t.ruleId),
    check("permanence_bonus_allocation_positive", sql`${t.value} > 0`),
  ],
);

// Snapshot por persona y término (ADR-025, ADR-036 regla 5): los JSON se validan con Zod al leer.
export const permanenceSnapshot = pgTable(
  "permanence_snapshot",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    status: membershipStatus().notNull(),
    isNew: boolean().notNull().default(false),
    probation: boolean().notNull().default(false),
    /** Falta grave vigente más otra sanción viva al cerrar: el cierre propone la expulsión (ADR-060 regla 6). */
    expulsionWarning: boolean().notNull().default(false),
    generalTotal: points().notNull().default(0),
    generalMax: points().notNull().default(0),
    general: jsonb().$type<unknown>().notNull(),
    results: jsonb().$type<unknown>().notNull(),
    mandatory: jsonb().$type<unknown>().notNull(),
    computedAt: timestampTz().notNull().defaultNow(),
    frozenAt: timestampTz(),
  },
  (t) => [
    uniqueIndex("permanence_snapshot_unique").on(t.termId, t.personId),
    index("permanence_snapshot_term_idx").on(t.termId, t.status),
  ],
);

// Decisión confirmada por GH en el cierre (ADR-027, ADR-028): una por comité y una por persona con
// `committeeId` nulo; las propuestas se derivan del snapshot y no se guardan hasta confirmarse.
// `proposalReason` es el motivo automático con que el cierre propuso, en el orden de T-801: lo guarda
// `confirmDecisions` con la decisión, porque no se puede volver a sacar cuando los hechos cambian
// después (ADR-128 regla 1). Es nulo solo en las decisiones confirmadas antes de que existiera la
// columna (migración 0051), que no se rellenaron: ese motivo no se calcula en SQL (DT-392).
export const permanenceDecision = pgTable(
  "permanence_decision",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    committeeId: text().references(() => committee.id),
    proposed: permanenceDecisionKind().notNull(),
    decision: permanenceDecisionKind().notNull(),
    reason: text(),
    proposalReason: integer().$type<ProposalReason>(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz().notNull().defaultNow(),
    appliedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("permanence_decision_committee_unique")
      .on(t.termId, t.personId, t.committeeId)
      .where(sql`${t.committeeId} is not null`),
    uniqueIndex("permanence_decision_person_unique")
      .on(t.termId, t.personId)
      .where(sql`${t.committeeId} is null`),
    index("permanence_decision_term_idx").on(t.termId, t.appliedAt),
    check(
      "permanence_decision_reason_when_changed",
      sql`${t.decision} = ${t.proposed} or ${t.reason} is not null`,
    ),
    // La fila de persona decide continuar o salir de la OE; la de comité, continuar, prueba o salir del comité.
    check(
      "permanence_decision_person_scope",
      sql`${t.committeeId} is not null or (${t.decision} in ('CONTINUES', 'EXIT_OE') and ${t.proposed} in ('CONTINUES', 'EXIT_OE'))`,
    ),
    check(
      "permanence_decision_committee_scope",
      sql`${t.committeeId} is null or (${t.decision} <> 'EXIT_OE' and ${t.proposed} <> 'EXIT_OE')`,
    ),
    check(
      "permanence_decision_proposal_reason_range",
      sql`${t.proposalReason} is null or ${t.proposalReason} between 0 and 5`,
    ),
  ],
);

// Los formatos de seguimiento de la Presidencia (ADR-197 reglas 4 y 5): el plan del mes y la nota de
// reunión del CAP con cada comité, el plan del mes con las direcciones generales de un macroevento, la
// reunión con Desarrollo Estudiantil y el empalme de cada dirección de la mesa.
export const followUpKind = pgEnum("follow_up_kind", [
  "CAP_PLAN",
  "CAP_MEETING",
  "EDITION_PLAN",
  "EDITION_MEETING",
  "EDITION_HANDOVER",
]);

// Las preguntas de cada formato, que la Presidencia edita sin código. Sin fila, valen las del catálogo
// de textos. `roleCode` vacío es la plantilla general; con un cargo de la mesa, sus preguntas propias.
export const followUpTemplate = pgTable(
  "follow_up_template",
  {
    id: id(),
    kind: followUpKind().notNull(),
    roleCode: text(),
    questions: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    updatedById: text().references(() => person.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("follow_up_template_kind_unique").on(t.kind).where(sql`${t.roleCode} is null`),
    uniqueIndex("follow_up_template_kind_role_unique")
      .on(t.kind, t.roleCode)
      .where(sql`${t.roleCode} is not null`),
    check("follow_up_template_questions_array", sql`jsonb_typeof(${t.questions}) = 'array'`),
  ],
);

// El acompañante del CAP de cada comité en el semestre (ADR-197 regla 4): lo asigna la Presidencia
// entre quienes están en el CAP.
export const capCompanion = pgTable(
  "cap_companion",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    committeeId: text()
      .notNull()
      .references(() => committee.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    assignedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("cap_companion_committee_unique").on(t.termId, t.committeeId),
    index("cap_companion_person_idx").on(t.personId, t.termId),
  ],
);

// La bitácora (ADR-197 reglas 4 y 5): cada entrada guarda las preguntas tal como estaban y sus
// respuestas, para que cambiar la plantilla no cambie lo ya escrito. El plan es uno por mes.
export const followUpEntry = pgTable(
  "follow_up_entry",
  {
    id: id(),
    kind: followUpKind().notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    committeeId: text().references(() => committee.id, { onDelete: "cascade" }),
    editionId: text().references(() => eventEdition.id, { onDelete: "cascade" }),
    /** El cargo de la mesa que entrega el empalme. */
    roleCode: text(),
    /** "AAAA-MM" en los planes del mes. */
    month: text(),
    occurredOn: date({ mode: "string" }).notNull(),
    answers: jsonb()
      .$type<Array<{ question: string; answer: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    authorId: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("follow_up_entry_committee_idx").on(t.committeeId, t.occurredOn),
    index("follow_up_entry_edition_idx").on(t.editionId, t.occurredOn),
    uniqueIndex("follow_up_entry_cap_plan_unique")
      .on(t.committeeId, t.month)
      .where(sql`${t.kind} = 'CAP_PLAN'`),
    uniqueIndex("follow_up_entry_edition_plan_unique")
      .on(t.editionId, t.month)
      .where(sql`${t.kind} = 'EDITION_PLAN'`),
    uniqueIndex("follow_up_entry_handover_unique")
      .on(t.editionId, t.roleCode)
      .where(sql`${t.kind} = 'EDITION_HANDOVER'`),
    check(
      "follow_up_entry_subject",
      sql`(${t.kind}::text like 'CAP_%') = (${t.committeeId} is not null and ${t.editionId} is null)`,
    ),
    check(
      "follow_up_entry_month",
      sql`(${t.kind}::text in ('CAP_PLAN', 'EDITION_PLAN')) = (${t.month} is not null)`,
    ),
    check(
      "follow_up_entry_month_format",
      sql`${t.month} is null or ${t.month} ~ '^[0-9]{4}-[0-9]{2}$'`,
    ),
    check(
      "follow_up_entry_handover_role",
      sql`(${t.kind}::text = 'EDITION_HANDOVER') = (${t.roleCode} is not null)`,
    ),
    check("follow_up_entry_answers_array", sql`jsonb_typeof(${t.answers}) = 'array'`),
  ],
);
