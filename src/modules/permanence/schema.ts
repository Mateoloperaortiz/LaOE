import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
