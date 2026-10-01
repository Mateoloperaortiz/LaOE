import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestampTz, updatedAt } from "@/db/columns";
import { eventEdition } from "@/modules/events/schema";
import { form, formSubmission } from "@/modules/forms/schema";
import { person } from "@/modules/people/schema";
import type { PowerDetail } from "./domain/powers-pure";

// The Games, la competencia por equipos de Días EAFIT (ADR-089), sus apuestas (ADR-091) y sus poderes
// (ADR-098). Los capitanes no son usuarios: de ellos se guarda solo el nombre y el celular (ADR-095),
// que se borran al archivar la competencia. Las demás personas son el personal asignado, el apoyo de
// cada base (ADR-101) y quien firma cada escritura. Los puntos de aquí no son GH Points y no tocan `point_entry`.

export const competitionStatus = pgEnum("competition_status", [
  "DRAFT",
  "LIVE",
  "FINISHED",
  "ARCHIVED",
]);
export const competitionTeamStatus = pgEnum("competition_team_status", ["ACTIVE", "WITHDRAWN"]);
export const competitionBaseKind = pgEnum("competition_base_kind", ["NORMAL", "MACRO"]);
export const competitionStaffRole = pgEnum("competition_staff_role", ["OPERATOR", "JUDGE"]);
export const competitionSupportRole = pgEnum("competition_support_role", [
  "GRADER",
  "OVERSEER",
  "VAR",
]);
export const competitionRotationStatus = pgEnum("competition_rotation_status", [
  "PENDING",
  "ACTIVE",
  "CLOSED",
]);
export const competitionMatchupSource = pgEnum("competition_matchup_source", [
  "GENERATED",
  "MANUAL",
]);
export const competitionOutcome = pgEnum("competition_outcome", ["A_WIN", "B_WIN", "DRAW"]);
export const competitionPointKind = pgEnum("competition_point_kind", [
  "MATCH",
  "EXTRA",
  "ADJUSTMENT",
  "REVERSAL",
]);
export const competitionAnnouncementLevel = pgEnum("competition_announcement_level", [
  "INFO",
  "WARNING",
  "URGENT",
]);
export const competitionMarketStatus = pgEnum("competition_market_status", [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "RESOLVED",
  "CANCELLED",
]);
export const competitionCreditKind = pgEnum("competition_credit_kind", [
  "GRANT",
  "STAKE",
  "PAYOUT",
  "REFUND",
  "ADJUSTMENT",
  "REVERSAL",
]);
/** Los poderes de ADR-098; los mismos de `POWER_TYPES` en powers-pure.ts. */
export const competitionPower = pgEnum("competition_power", [
  "RESULT_SWAP",
  "DOUBLE_POINTS",
  "CANCEL_POWER",
  "LATE_START",
  "ONE_PLAYER_DOWN",
]);
export const competitionPowerGrantStatus = pgEnum("competition_power_grant_status", [
  "ASSIGNED",
  "DELIVERED",
  "VOIDED",
]);
export const competitionPowerUseStatus = pgEnum("competition_power_use_status", [
  "ACTIVE",
  "REVERTED",
]);

/** Una competencia por edición de Días EAFIT; la de ensayo se opera igual y se archiva. */
export const competition = pgTable(
  "competition",
  {
    id: id(),
    editionId: text()
      .notNull()
      .references(() => eventEdition.id),
    slug: text().notNull(),
    name: text().notNull(),
    status: competitionStatus().notNull().default("DRAFT"),
    isRehearsal: boolean().notNull().default(false),
    /** Fechas de las jornadas; nulas mientras la OE no las confirme (no se inventan). */
    firstDayOn: date({ mode: "string" }),
    secondDayOn: date({ mode: "string" }),
    registrationFormId: text().references(() => form.id, { onDelete: "set null" }),
    bettingEnabled: boolean().notNull().default(false),
    /** Puntos de apuestas iniciales por equipo (ADR-091 regla 1): 1000 en 2026. */
    startingCredits: integer(),
    /** Si un equipo puede apostar por sí mismo; apagado hasta que la OE lo confirme. */
    allowSelfBet: boolean().notNull().default(false),
    /** Si la vitrina muestra los nombres de los capitanes (ADR-095); lo prende solo ADMIN. */
    showCaptains: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_slug_unique").on(t.slug),
    index("competition_edition_idx").on(t.editionId),
    check("competition_slug_format", sql`${t.slug} ~ '^[a-z0-9-]{2,40}$'`),
    check(
      "competition_starting_credits",
      sql`${t.startingCredits} is null or ${t.startingCredits} >= 0`,
    ),
  ],
);

/** Un equipo: número, nombre, color y de qué respuesta de inscripción salió. Sin datos personales. */
export const competitionTeam = pgTable(
  "competition_team",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    name: text().notNull(),
    color: text(),
    status: competitionTeamStatus().notNull().default("ACTIVE"),
    submissionId: text().references(() => formSubmission.id, { onDelete: "set null" }),
    /** Hash con secreto del código del equipo; el código en claro se muestra una sola vez. */
    codeHash: text(),
    codeIssuedAt: timestampTz(),
    codeFailures: integer().notNull().default(0),
    codeLockedUntil: timestampTz(),
    /** La última versión de las instrucciones del hub que aceptó el equipo, y cuándo (ADR-099). */
    hubTermsVersion: integer(),
    hubTermsAcceptedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_team_number_unique").on(t.competitionId, t.number),
    uniqueIndex("competition_team_name_unique").on(t.competitionId, sql`lower(${t.name})`),
    uniqueIndex("competition_team_submission_unique")
      .on(t.competitionId, t.submissionId)
      .where(sql`${t.submissionId} is not null`),
    check("competition_team_number_range", sql`${t.number} between 1 and 99`),
    check("competition_team_name_length", sql`char_length(${t.name}) between 1 and 60`),
    check(
      "competition_team_color_format",
      sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`,
    ),
    check("competition_team_code_failures", sql`${t.codeFailures} >= 0`),
  ],
);

/** Un capitán de un equipo (ADR-095): solo nombre y celular, pegados de la hoja de la OE. */
export const competitionTeamCaptain = pgTable(
  "competition_team_captain",
  {
    id: id(),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    /** 1 o 2, en el orden de la hoja. */
    position: integer().notNull(),
    name: text().notNull(),
    /** Diez dígitos, sin el 57 del país; nulo si la hoja no lo trae. */
    phone: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_team_captain_position_unique").on(t.teamId, t.position),
    check("competition_team_captain_position_range", sql`${t.position} between 1 and 2`),
    check("competition_team_captain_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "competition_team_captain_phone_format",
      sql`${t.phone} is null or ${t.phone} ~ '^[0-9]{10}$'`,
    ),
  ],
);

/** Una base de una jornada; las de inflables son `MACRO` (ADR-089 regla 5). */
export const competitionBase = pgTable(
  "competition_base",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    day: integer().notNull(),
    orderIndex: integer().notNull(),
    name: text().notNull(),
    kind: competitionBaseKind().notNull().default("NORMAL"),
    location: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_base_order_unique").on(t.competitionId, t.day, t.orderIndex),
    uniqueIndex("competition_base_name_unique").on(t.competitionId, t.day, sql`lower(${t.name})`),
    check("competition_base_day", sql`${t.day} in (1, 2)`),
    check("competition_base_order", sql`${t.orderIndex} >= 0`),
  ],
);

/** Operadores y jueces asignados (ADR-089 regla 10); el juez va ligado a una base. */
export const competitionStaff = pgTable(
  "competition_staff",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    role: competitionStaffRole().notNull(),
    baseId: text().references(() => competitionBase.id, { onDelete: "cascade" }),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_staff_operator_unique")
      .on(t.competitionId, t.personId)
      .where(sql`${t.baseId} is null`),
    uniqueIndex("competition_staff_judge_unique")
      .on(t.baseId, t.personId)
      .where(sql`${t.baseId} is not null`),
    index("competition_staff_person_idx").on(t.personId),
    check(
      "competition_staff_judge_base",
      sql`(${t.role}::text = 'JUDGE') = (${t.baseId} is not null)`,
    ),
  ],
);

/** El apoyo de una base: calificador, veedores y VAR, desde la hoja del GAP (ADR-101). No da ningún
 *  acceso: el acceso a la competencia sale solo de `competition_staff`. */
export const competitionSupport = pgTable(
  "competition_support",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    baseId: text()
      .notNull()
      .references(() => competitionBase.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    role: competitionSupportRole().notNull(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_support_base_person_unique").on(t.baseId, t.personId),
    index("competition_support_person_idx").on(t.personId),
  ],
);

/** Una rotación de una jornada; una sola `ACTIVE` por competencia (ADR-089 regla 9). */
export const competitionRotation = pgTable(
  "competition_rotation",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    day: integer().notNull(),
    number: integer().notNull(),
    status: competitionRotationStatus().notNull().default("PENDING"),
    /** Duración prevista; la fija el operador al generar (no hay valor por defecto inventado). */
    plannedSeconds: integer().notNull(),
    startsAt: timestampTz(),
    endsAt: timestampTz(),
    startedById: text().references(() => person.id, { onDelete: "set null" }),
    closedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_rotation_number_unique").on(t.competitionId, t.day, t.number),
    uniqueIndex("competition_rotation_one_active")
      .on(t.competitionId)
      .where(sql`${t.status} = 'ACTIVE'`),
    check("competition_rotation_day", sql`${t.day} in (1, 2)`),
    check("competition_rotation_number", sql`${t.number} >= 1`),
    check("competition_rotation_planned", sql`${t.plannedSeconds} between 60 and 14400`),
    check(
      "competition_rotation_window",
      sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

/** Un enfrentamiento de una rotación en una base. */
export const competitionMatchup = pgTable(
  "competition_matchup",
  {
    id: id(),
    rotationId: text()
      .notNull()
      .references(() => competitionRotation.id, { onDelete: "cascade" }),
    baseId: text()
      .notNull()
      .references(() => competitionBase.id),
    teamAId: text()
      .notNull()
      .references(() => competitionTeam.id),
    teamBId: text()
      .notNull()
      .references(() => competitionTeam.id),
    source: competitionMatchupSource().notNull().default("GENERATED"),
    /** Cuándo empezó la base (ADR-098 regla 4): lo marca el líder o el registro del resultado, y
     *  desde ahí no se declaran poderes. */
    startedAt: timestampTz(),
    startedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_matchup_base_unique").on(t.rotationId, t.baseId),
    uniqueIndex("competition_matchup_team_a_unique").on(t.rotationId, t.teamAId),
    uniqueIndex("competition_matchup_team_b_unique").on(t.rotationId, t.teamBId),
    index("competition_matchup_team_a_idx").on(t.teamAId),
    index("competition_matchup_team_b_idx").on(t.teamBId),
    check("competition_matchup_distinct", sql`${t.teamAId} <> ${t.teamBId}`),
  ],
);

/** El desenlace de un enfrentamiento; uno vigente, y corregirlo lo reemplaza (ADR-089 regla 6). */
export const competitionResult = pgTable(
  "competition_result",
  {
    id: id(),
    matchupId: text()
      .notNull()
      .references(() => competitionMatchup.id, { onDelete: "cascade" }),
    outcome: competitionOutcome().notNull(),
    notes: text().notNull().default(""),
    recordedById: text().references(() => person.id, { onDelete: "set null" }),
    supersededAt: timestampTz(),
    supersedeReason: text(),
    /** Con poderes (ADR-098 regla 5): el resultado oficial y su desglose. `outcome` sigue siendo el de
     *  la cancha; sin poderes, los dos van nulos y el oficial es el de la cancha. */
    officialOutcome: competitionOutcome(),
    powerDetail: jsonb().$type<PowerDetail>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_result_current_unique")
      .on(t.matchupId)
      .where(sql`${t.supersededAt} is null`),
    index("competition_result_matchup_idx").on(t.matchupId, t.createdAt),
    check(
      "competition_result_power_detail",
      sql`(${t.officialOutcome} is null) = (${t.powerDetail} is null)`,
    ),
  ],
);

/** Una competencia extra, como la de talentos; cuenta en su jornada (ADR-089 regla 7). */
export const competitionExtra = pgTable(
  "competition_extra",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    name: text().notNull(),
    day: integer().notNull(),
    /** Con rúbrica: los puntos son el total (0 a 100) por esta escala. Nulo: puntos directos. */
    rubricScale: integer(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_extra_name_unique").on(t.competitionId, sql`lower(${t.name})`),
    check("competition_extra_day", sql`${t.day} in (1, 2)`),
    check(
      "competition_extra_rubric_scale",
      sql`${t.rubricScale} is null or ${t.rubricScale} between 1 and 100`,
    ),
  ],
);

/** Un criterio de la rúbrica de una competencia extra, con su peso en porcentaje (ADR-089 regla 7). */
export const competitionExtraCriterion = pgTable(
  "competition_extra_criterion",
  {
    id: id(),
    extraId: text()
      .notNull()
      .references(() => competitionExtra.id, { onDelete: "cascade" }),
    name: text().notNull(),
    weight: integer().notNull(),
    orderIndex: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_extra_criterion_order_unique").on(t.extraId, t.orderIndex),
    check("competition_extra_criterion_weight", sql`${t.weight} between 1 and 100`),
  ],
);

/** Las notas de un jurado a un equipo en una extra de puntos directos, como The Challenge (ADR-103):
 *  las 5 de la rúbrica, del 1 al 10. No tocan el libro: ordenan a los equipos para el podio. */
export const competitionExtraJuryScore = pgTable(
  "competition_extra_jury_score",
  {
    id: id(),
    extraId: text()
      .notNull()
      .references(() => competitionExtra.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    judge: text().notNull(),
    scores: integer().array().notNull(),
    recordedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_extra_jury_score_unique").on(
      t.extraId,
      sql`lower(${t.judge})`,
      t.teamId,
    ),
    index("competition_extra_jury_score_team_idx").on(t.teamId),
    check(
      "competition_extra_jury_score_scores",
      sql`cardinality(${t.scores}) = 5 and 1 <= all(${t.scores}) and 10 >= all(${t.scores})`,
    ),
    check("competition_extra_jury_score_judge", sql`char_length(${t.judge}) between 1 and 60`),
  ],
);

/** La calificación consolidada de un equipo en un criterio, del 1 al 10. */
export const competitionExtraScore = pgTable(
  "competition_extra_score",
  {
    id: id(),
    criterionId: text()
      .notNull()
      .references(() => competitionExtraCriterion.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    score: integer().notNull(),
    recordedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competition_extra_score_unique").on(t.criterionId, t.teamId),
    index("competition_extra_score_team_idx").on(t.teamId),
    check("competition_extra_score_range", sql`${t.score} between 1 and 10`),
  ],
);

/** El libro de puntos de la competencia: append-only; las correcciones son reversiones. */
export const competitionPointEntry = pgTable(
  "competition_point_entry",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    day: integer().notNull(),
    kind: competitionPointKind().notNull(),
    points: integer().notNull(),
    reason: text().notNull().default(""),
    resultId: text().references(() => competitionResult.id),
    extraId: text().references(() => competitionExtra.id),
    reversalOfId: text().references((): AnyPgColumn => competitionPointEntry.id),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_point_entry_result_team_unique")
      .on(t.resultId, t.teamId)
      .where(sql`${t.resultId} is not null`),
    uniqueIndex("competition_point_entry_reversal_unique").on(t.reversalOfId),
    index("competition_point_entry_team_idx").on(t.competitionId, t.teamId),
    index("competition_point_entry_day_idx").on(t.competitionId, t.day),
    index("competition_point_entry_extra_idx").on(t.extraId, t.teamId),
    check("competition_point_entry_day", sql`${t.day} in (1, 2)`),
    check(
      "competition_point_entry_match",
      sql`(${t.kind}::text = 'MATCH') = (${t.resultId} is not null)`,
    ),
    check(
      "competition_point_entry_extra",
      sql`(${t.kind}::text = 'EXTRA') = (${t.extraId} is not null)`,
    ),
    check(
      "competition_point_entry_reversal",
      sql`(${t.kind}::text = 'REVERSAL') = (${t.reversalOfId} is not null)`,
    ),
    check(
      "competition_point_entry_reason",
      sql`${t.kind}::text not in ('ADJUSTMENT', 'REVERSAL') or ${t.reason} <> ''`,
    ),
  ],
);

/** Un anuncio para la vitrina (ADR-089 regla 11). */
export const competitionAnnouncement = pgTable(
  "competition_announcement",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    message: text().notNull(),
    level: competitionAnnouncementLevel().notNull().default("INFO"),
    active: boolean().notNull().default(true),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("competition_announcement_active_idx").on(t.competitionId, t.active, t.createdAt),
    check("competition_announcement_length", sql`char_length(${t.message}) between 1 and 280`),
  ],
);

/** Una apuesta que abre el operador, con dos o más equipos como opciones (ADR-091 regla 2). */
export const competitionMarket = pgTable(
  "competition_market",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    title: text().notNull(),
    status: competitionMarketStatus().notNull().default("DRAFT"),
    matchupId: text().references(() => competitionMatchup.id, { onDelete: "set null" }),
    closesAt: timestampTz(),
    winnerTeamId: text().references(() => competitionTeam.id),
    resolvedAt: timestampTz(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("competition_market_competition_idx").on(t.competitionId, t.createdAt),
    check("competition_market_title_length", sql`char_length(${t.title}) between 1 and 120`),
    check(
      "competition_market_resolved",
      sql`(${t.status}::text in ('RESOLVED', 'CANCELLED')) = (${t.resolvedAt} is not null)`,
    ),
  ],
);

export const competitionMarketOption = pgTable(
  "competition_market_option",
  {
    id: id(),
    marketId: text()
      .notNull()
      .references(() => competitionMarket.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("competition_market_option_unique").on(t.marketId, t.teamId)],
);

/** La apuesta de un equipo en una apuesta abierta: una por equipo (ADR-091 regla 3). */
export const competitionBet = pgTable(
  "competition_bet",
  {
    id: id(),
    marketId: text()
      .notNull()
      .references(() => competitionMarket.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    pickTeamId: text()
      .notNull()
      .references(() => competitionTeam.id),
    stake: integer().notNull(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_bet_team_unique").on(t.marketId, t.teamId),
    check("competition_bet_stake", sql`${t.stake} > 0`),
  ],
);

/** El libro de puntos de apuestas: append-only; el saldo es la suma (ADR-091 regla 1). */
export const competitionCreditEntry = pgTable(
  "competition_credit_entry",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    kind: competitionCreditKind().notNull(),
    amount: integer().notNull(),
    betId: text().references(() => competitionBet.id),
    reversalOfId: text().references((): AnyPgColumn => competitionCreditEntry.id),
    reason: text().notNull().default(""),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    // Un STAKE, un PAYOUT o un REFUND por apuesta: resolver dos veces no paga dos veces.
    uniqueIndex("competition_credit_entry_bet_kind_unique")
      .on(t.betId, t.kind)
      .where(sql`${t.betId} is not null`),
    uniqueIndex("competition_credit_entry_grant_unique")
      .on(t.competitionId, t.teamId)
      .where(sql`${t.kind} = 'GRANT'`),
    uniqueIndex("competition_credit_entry_reversal_unique").on(t.reversalOfId),
    index("competition_credit_entry_team_idx").on(t.competitionId, t.teamId),
    check("competition_credit_entry_nonzero", sql`${t.amount} <> 0`),
    check(
      "competition_credit_entry_sign",
      sql`(${t.kind}::text in ('GRANT', 'PAYOUT', 'REFUND') and ${t.amount} > 0) or (${t.kind}::text = 'STAKE' and ${t.amount} < 0) or ${t.kind}::text in ('ADJUSTMENT', 'REVERSAL')`,
    ),
    check(
      "competition_credit_entry_bet",
      sql`(${t.kind}::text in ('STAKE', 'PAYOUT', 'REFUND')) = (${t.betId} is not null)`,
    ),
    check(
      "competition_credit_entry_reversal",
      sql`(${t.kind}::text = 'REVERSAL') = (${t.reversalOfId} is not null)`,
    ),
  ],
);

/** Una tarjeta física de poder de un equipo para una jornada (ADR-098 regla 3). Se asigna, se entrega
 *  y se usa una vez; anularla exige motivo. */
export const competitionPowerGrant = pgTable(
  "competition_power_grant",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    power: competitionPower().notNull(),
    day: integer().notNull(),
    status: competitionPowerGrantStatus().notNull().default("ASSIGNED"),
    deliveredAt: timestampTz(),
    deliveredById: text().references(() => person.id, { onDelete: "set null" }),
    voidedAt: timestampTz(),
    voidedById: text().references(() => person.id, { onDelete: "set null" }),
    voidReason: text(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("competition_power_grant_team_idx").on(t.competitionId, t.teamId, t.day),
    check("competition_power_grant_day", sql`${t.day} in (1, 2)`),
    check(
      "competition_power_grant_delivered",
      sql`${t.status}::text <> 'DELIVERED' or ${t.deliveredAt} is not null`,
    ),
    check(
      "competition_power_grant_voided",
      sql`(${t.status}::text = 'VOIDED') = (${t.voidedAt} is not null)`,
    ),
    check(
      "competition_power_grant_void_reason",
      sql`${t.status}::text <> 'VOIDED' or char_length(${t.voidReason}) between 2 and 200`,
    ),
  ],
);

/** La declaración de una tarjeta en una rotación (ADR-098 regla 3): va por rotación y equipo, porque
 *  editar una rotación reescribe sus enfrentamientos. Un uso activo por tarjeta y uno por equipo en
 *  cada rotación; revertirlo exige motivo. */
export const competitionPowerUse = pgTable(
  "competition_power_use",
  {
    id: id(),
    competitionId: text()
      .notNull()
      .references(() => competition.id, { onDelete: "cascade" }),
    grantId: text()
      .notNull()
      .references(() => competitionPowerGrant.id, { onDelete: "cascade" }),
    rotationId: text()
      .notNull()
      .references(() => competitionRotation.id, { onDelete: "cascade" }),
    teamId: text()
      .notNull()
      .references(() => competitionTeam.id, { onDelete: "cascade" }),
    baseId: text()
      .notNull()
      .references(() => competitionBase.id, { onDelete: "cascade" }),
    status: competitionPowerUseStatus().notNull().default("ACTIVE"),
    /** Quién recibió la tarjeta física; `createdAt` es cuándo. */
    receivedById: text().references(() => person.id, { onDelete: "set null" }),
    revertedAt: timestampTz(),
    revertedById: text().references(() => person.id, { onDelete: "set null" }),
    revertReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("competition_power_use_grant_unique")
      .on(t.grantId)
      .where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex("competition_power_use_team_unique")
      .on(t.rotationId, t.teamId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index("competition_power_use_team_idx").on(t.competitionId, t.teamId),
    check(
      "competition_power_use_reverted",
      sql`(${t.status}::text = 'REVERTED') = (${t.revertedAt} is not null)`,
    ),
    check(
      "competition_power_use_revert_reason",
      sql`${t.status}::text <> 'REVERTED' or char_length(${t.revertReason}) between 2 and 200`,
    ),
  ],
);
