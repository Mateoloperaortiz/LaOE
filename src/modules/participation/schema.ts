import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
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
import { eventEdition } from "@/modules/events/schema";
import { form } from "@/modules/forms/schema";
import { committee, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import type { WordleLetterState } from "./wordle-types";

// Participación (ADR-006, ADR-007, ADR-009, ADR-024, ADR-035): una sola mecánica de asistencia
// (ocasión + check-in), ledger append-only por término, score de comité por ocasión, standing al
// cerrar los puntos y ajustes al requisito de asambleas.

export const occasionKind = pgEnum("occasion_kind", ["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"]);
export const assemblyKind = pgEnum("assembly_kind", ["ORDINARY", "BOARD_ELECTION", "RUNOFF"]);
export const occasionCategory = pgEnum("occasion_category", [
  "INTEGRATION",
  "ATHLETIC_MATCH",
  "COMMITTEE_MEETING",
  "TALK",
  "WORKSHOP",
  "SOCIAL",
  "OTHER",
  // Inducción de nuevos (Regl. art. 47; ADR-060 regla 13): obligatoria para nuevos como las asambleas.
  "INDUCTION",
]);
export const occasionApproval = pgEnum("occasion_approval", ["AUTO", "MANUAL"]);
export const occasionStatus = pgEnum("occasion_status", ["DRAFT", "OPEN", "CLOSED", "CANCELLED"]);
// EXCUSED: falta con excusa válida aceptada (ADR-060 regla 5); no da puntos ni cuenta como falta.
export const checkInStatus = pgEnum("check_in_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXCUSED",
]);
export const checkInSource = pgEnum("check_in_source", ["SELF_QR", "HOST", "ADMIN", "IMPORT"]);
export const pointEntryKind = pgEnum("point_entry_kind", [
  "CHECKIN",
  "ADJUSTMENT",
  "REVERSAL",
  "LEGACY",
  "WORDLE",
]);

export const wordleStatus = pgEnum("wordle_status", ["IN_PROGRESS", "WON", "LOST", "EXPIRED"]);

// La respuesta es privada: únicamente las proyecciones del dominio pueden salir de este módulo.
export const wordleGame = pgTable(
  "wordle_game",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    answer: text().notNull(),
    dictionaryVersion: text().notNull(),
    rulesVersion: text().notNull(),
    status: wordleStatus().notNull().default("IN_PROGRESS"),
    completedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("wordle_game_person_day_unique").on(t.personId, t.day),
    uniqueIndex("wordle_game_answer_day_unique").on(t.answer, t.day),
    index("wordle_game_term_idx").on(t.termId),
    check("wordle_game_answer_format", sql`${t.answer} ~ '^[A-ZÑ]{5}$'`),
    check(
      "wordle_game_completed_consistent",
      sql`(${t.status} = 'IN_PROGRESS') = (${t.completedAt} is null)`,
    ),
  ],
);

export const wordleAttempt = pgTable(
  "wordle_attempt",
  {
    id: id(),
    gameId: text()
      .notNull()
      .references(() => wordleGame.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    requestId: text().notNull(),
    guess: text().notNull(),
    feedback: jsonb().$type<WordleLetterState[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("wordle_attempt_game_ordinal_unique").on(t.gameId, t.ordinal),
    uniqueIndex("wordle_attempt_game_request_unique").on(t.gameId, t.requestId),
    check("wordle_attempt_ordinal_range", sql`${t.ordinal} between 1 and 6`),
    check("wordle_attempt_guess_format", sql`${t.guess} ~ '^[A-ZÑ]{5}$'`),
    check(
      "wordle_attempt_feedback_length",
      sql`jsonb_typeof(${t.feedback}) = 'array' and jsonb_array_length(${t.feedback}) = 5`,
    ),
  ],
);

// Momento con check-in: actividad, asamblea o sesión de una edición. `publicId` va en la URL y el QR.
export const occasion = pgTable(
  "occasion",
  {
    id: id(),
    publicId: text().notNull(),
    termId: text()
      .notNull()
      .references(() => term.id),
    kind: occasionKind().notNull().default("ACTIVITY"),
    assemblyKind: assemblyKind(),
    category: occasionCategory().notNull().default("OTHER"),
    newMembersOnly: boolean().notNull().default(false),
    title: text().notNull(),
    description: text().notNull().default(""), // Markdown
    location: text().notNull().default(""),
    startsAt: timestampTz().notNull(),
    endsAt: timestampTz(),
    checkInOpensAt: timestampTz().notNull(),
    checkInClosesAt: timestampTz().notNull(),
    points: integer().notNull().default(0),
    approval: occasionApproval().notNull().default("AUTO"),
    requireRotatingCode: boolean().notNull().default(false),
    // Secreto por ocasión del que se deriva el código de 6 dígitos; en texto porque la consola lo muestra.
    rotatingSecret: text(),
    committeeId: text().references(() => committee.id),
    editionId: text().references(() => eventEdition.id, { onDelete: "set null" }),
    // Encuesta al cerrar (ADR-038 regla 13): un formulario de miembros cuyas preguntas responden los asistentes.
    surveyFormId: text().references(() => form.id, { onDelete: "set null" }),
    status: occasionStatus().notNull().default("DRAFT"),
    cancelReason: text(),
    closedAt: timestampTz(),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    legacyId: text(), // id de Activity o Assembly en GHPOINTS
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("occasion_public_id_unique").on(t.publicId),
    uniqueIndex("occasion_legacy_id_unique").on(t.legacyId).where(sql`${t.legacyId} is not null`),
    // Una elección de junta y una segunda vuelta por término (ADR-024).
    uniqueIndex("occasion_board_election_unique")
      .on(t.termId)
      .where(sql`${t.assemblyKind} = 'BOARD_ELECTION' and ${t.status} <> 'CANCELLED'`),
    uniqueIndex("occasion_runoff_unique")
      .on(t.termId)
      .where(sql`${t.assemblyKind} = 'RUNOFF' and ${t.status} <> 'CANCELLED'`),
    index("occasion_term_status_idx").on(t.termId, t.status),
    index("occasion_window_idx").on(t.status, t.checkInOpensAt, t.checkInClosesAt),
    check("occasion_public_id_format", sql`${t.publicId} ~ '^[0-9a-z]{10}$'`),
    check("occasion_window_ordered", sql`${t.checkInOpensAt} < ${t.checkInClosesAt}`),
    check("occasion_points_nonnegative", sql`${t.points} >= 0`),
    check(
      "occasion_assembly_kind_consistent",
      sql`(${t.kind} = 'ASSEMBLY') = (${t.assemblyKind} is not null)`,
    ),
    check("occasion_assembly_no_points", sql`${t.kind} <> 'ASSEMBLY' or ${t.points} = 0`),
    check(
      "occasion_edition_session_has_edition",
      sql`${t.kind} <> 'EDITION_SESSION' or ${t.editionId} is not null`,
    ),
  ],
);

// Registro de una persona en una ocasión; único por par. La IP queda en la auditoría (ADR-014).
export const checkIn = pgTable(
  "check_in",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    status: checkInStatus().notNull().default("PENDING"),
    source: checkInSource().notNull().default("SELF_QR"),
    at: timestampTz().notNull().defaultNow(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    reason: text(),
    legacyId: text(), // id de Attendance o AssemblyAttendance en GHPOINTS
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("check_in_occasion_person_unique").on(t.occasionId, t.personId),
    uniqueIndex("check_in_legacy_id_unique").on(t.legacyId).where(sql`${t.legacyId} is not null`),
    index("check_in_person_idx").on(t.personId, t.at),
    index("check_in_occasion_status_idx").on(t.occasionId, t.status),
  ],
);

// Ledger append-only (ADR-007): un check-in aprobado tiene exactamente una entrada CHECKIN viva;
// cualquier otro estado equivale a neto cero mediante una REVERSAL con reversalOfId único.
export const pointEntry = pgTable(
  "point_entry",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    checkInId: text().references(() => checkIn.id),
    wordleGameId: text().references(() => wordleGame.id),
    kind: pointEntryKind().notNull(),
    points: integer().notNull(),
    reason: text().notNull(),
    reversalOfId: text().references((): AnyPgColumn => pointEntry.id),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    legacyType: text(), // tipo original en GHPOINTS (FLASH, BOOST, WORDLE, BONUS…)
    legacyId: text(), // id de PointTransaction en GHPOINTS
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("point_entry_checkin_unique").on(t.checkInId).where(sql`${t.kind} = 'CHECKIN'`),
    uniqueIndex("point_entry_reversal_of_unique").on(t.reversalOfId),
    uniqueIndex("point_entry_wordle_game_unique").on(t.wordleGameId),
    uniqueIndex("point_entry_legacy_id_unique")
      .on(t.legacyId)
      .where(sql`${t.legacyId} is not null`),
    index("point_entry_person_term_idx").on(t.personId, t.termId),
    index("point_entry_term_created_idx").on(t.termId, t.createdAt),
    check("point_entry_nonzero", sql`${t.points} <> 0`),
    check(
      "point_entry_wordle_consistent",
      sql`(${t.kind}::text = 'WORDLE') = (${t.wordleGameId} is not null)`,
    ),
    check(
      "point_entry_wordle_reward",
      sql`${t.kind}::text <> 'WORDLE' or ${t.points} between 1 and 6`,
    ),
    check(
      "point_entry_reversal_consistent",
      sql`(${t.kind} = 'REVERSAL') = (${t.reversalOfId} is not null)`,
    ),
  ],
);

// Score de un comité en una ocasión (ADR-009, ADR-024): solo comités con elegibles; el denominador
// se congela al cerrar la ocasión.
export const committeeParticipation = pgTable(
  "committee_participation",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    termId: text()
      .notNull()
      .references(() => term.id),
    eligible: integer().notNull(),
    present: integer().notNull(),
    rate: numeric({ precision: 6, scale: 4, mode: "number" }).notNull(),
    smoothedRate: numeric({ precision: 6, scale: 4, mode: "number" }).notNull(),
    frozenAt: timestampTz(),
    computedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("committee_participation_unique").on(t.occasionId, t.committeeId),
    index("committee_participation_term_idx").on(t.termId, t.committeeId),
  ],
);

// Snapshot de los tableros al cerrar los puntos del término (ADR-004); los JSON se validan con Zod al leer.
export const termStanding = pgTable(
  "term_standing",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    topNew: jsonb().$type<unknown>().notNull(),
    topVeteran: jsonb().$type<unknown>().notNull(),
    topCommittees: jsonb().$type<unknown>().notNull(),
    stats: jsonb().$type<unknown>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("term_standing_term_unique").on(t.termId)],
);

// Ajuste individual al requisito de asambleas (ADR-024, ADR-028): el valor por defecto se deriva del
// término; aquí solo viven los ajustes de ADMIN con motivo.
export const assemblyRequirement = pgTable(
  "assembly_requirement",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    requiredOrdinary: integer().notNull(),
    requiresBoardElection: boolean().notNull(),
    requiresRunoff: boolean().notNull(),
    adjustedReason: text().notNull(),
    adjustedById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("assembly_requirement_unique").on(t.termId, t.personId)],
);

// Encuesta anónima tras la ocasión (ADR-038 regla 13): la invitación sabe quién puede responder y si
// respondió; la respuesta no referencia a nadie.
export const occasionSurveyInvite = pgTable(
  "occasion_survey_invite",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    tokenHash: text().notNull(),
    sentAt: timestampTz(),
    answeredAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("occasion_survey_invite_unique").on(t.occasionId, t.personId),
    uniqueIndex("occasion_survey_invite_token_unique").on(t.tokenHash),
  ],
);

export const occasionSurveyResponse = pgTable(
  "occasion_survey_response",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    committeeId: text().references(() => committee.id, { onDelete: "set null" }),
    answers: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index("occasion_survey_response_occasion_idx").on(t.occasionId)],
);

// Asistencia de cada comité a una asamblea cerrada (Regl. art. 14 y 64; ADR-060 regla 7): representado
// si su titular, su suplente o cualquier cargo de dirección registró asistencia; con excusa si alguno
// de ellos tiene la excusa aceptada. Derivada por outbox al cerrar la asamblea y al cambiar un check-in.
export const committeeAssemblyAttendance = pgTable(
  "committee_assembly_attendance",
  {
    id: id(),
    occasionId: text()
      .notNull()
      .references(() => occasion.id, { onDelete: "cascade" }),
    committeeId: text()
      .notNull()
      .references(() => committee.id),
    termId: text()
      .notNull()
      .references(() => term.id),
    represented: boolean().notNull().default(false),
    excused: boolean().notNull().default(false),
    representedById: text().references(() => person.id, { onDelete: "set null" }),
    computedAt: timestampTz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("committee_assembly_attendance_unique").on(t.occasionId, t.committeeId),
    index("committee_assembly_attendance_term_idx").on(t.termId, t.committeeId),
  ],
);
