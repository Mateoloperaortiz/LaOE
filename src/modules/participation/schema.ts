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
import type { HslColor } from "./color-types";
import type { WordleLetterState } from "./wordle-types";

// Participación (ADR-006, ADR-007, ADR-009, ADR-024, ADR-035): una sola mecánica de asistencia
// (ocasión + check-in), ledger append-only por término, score de comité por ocasión, standing al
// cerrar los puntos y ajustes al requisito de asambleas.

export const presenceNoticePolicy = pgTable(
  "presence_notice_policy",
  { id: text().primaryKey(), effectiveAt: timestampTz() },
  (t) => [check("presence_notice_policy_singleton", sql`${t.id} = 'NOTICE_24H'`)],
);

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
export const attendanceExtent = pgEnum("attendance_extent", ["FULL", "PARTIAL"]);
export const attendanceList = pgEnum("attendance_list", ["FIRST", "SECOND"]);
export const pointEntryKind = pgEnum("point_entry_kind", [
  "CHECKIN",
  "ADJUSTMENT",
  "REVERSAL",
  "LEGACY",
  "WORDLE",
  // ADR-067: premio base de un reto (o asistencia impulsada) y su extra por booster o campaña.
  "CHALLENGE",
  "BOOST",
  // ADR-075: premio del 2048, de 1 a 6 puntos y uno por día.
  "GAME2048",
  // ADR-078: premio del Sudoku, 2, 4 o 6 puntos por dificultad (la mitad con ayudas) y uno por día.
  "SUDOKU",
  "PANAL",
  "PRESENCE_STREAK",
  "COLOR",
]);

export const wordleStatus = pgEnum("wordle_status", ["IN_PROGRESS", "WON", "LOST", "EXPIRED"]);

export const game2048Status = pgEnum("game2048_status", ["IN_PROGRESS", "FINISHED", "EXPIRED"]);

export const colorStatus = pgEnum("color_status", ["IN_PROGRESS", "FINISHED", "EXPIRED"]);

export const sudokuStatus = pgEnum("sudoku_status", [
  "IN_PROGRESS",
  "SOLVED",
  "ABANDONED",
  "EXPIRED",
]);
export const sudokuDifficulty = pgEnum("sudoku_difficulty", ["EASY", "MEDIUM", "HARD"]);

// Gamificación (ADR-067): retos relámpago, boosters, campañas, premios con topes y colección.
export const challengeKind = pgEnum("challenge_kind", ["PRESENTIAL", "TRIVIA", "EVIDENCE"]);
export const challengeAudience = pgEnum("challenge_audience", [
  "ALL",
  "NEW",
  "VETERAN",
  "COMMITTEES",
]);
export const challengeStatus = pgEnum("challenge_status", ["DRAFT", "PUBLISHED", "CANCELLED"]);
export const challengeParticipationStatus = pgEnum("challenge_participation_status", [
  "PENDING",
  "COMPLETED",
  "REJECTED",
  "ANNULLED",
]);
export const evidenceFileStatus = pgEnum("evidence_file_status", ["PENDING", "READY", "FAILED"]);
export const boosterKind = pgEnum("booster_kind", ["PLUS_50", "PLUS_100"]);
export const boosterItemStatus = pgEnum("booster_item_status", [
  "AVAILABLE",
  "RESERVED",
  "CONSUMED",
  "REVOKED",
]);
export const boostCampaignStatus = pgEnum("boost_campaign_status", ["ACTIVE", "CANCELLED"]);
export const rewardSource = pgEnum("reward_source", ["CHALLENGE", "CHECKIN"]);
export const rewardStatus = pgEnum("reward_status", [
  "RESERVED",
  "GRANTED",
  "RELEASED",
  "REVERSED",
]);
export const badgeFamily = pgEnum("badge_family", [
  "EN_PARCHE",
  "EXPLORADOR",
  "RELAMPAGO",
  "PALABRA_A_PALABRA",
  "SPECIAL",
]);
export const reconciliationMode = pgEnum("reconciliation_mode", ["DRY_RUN", "APPLY"]);
export const reconciliationStatus = pgEnum("reconciliation_status", ["RUNNING", "DONE", "FAILED"]);

// La respuesta es privada: únicamente las proyecciones del dominio pueden salir de este módulo.
// Panal diario: el catálogo privado se conserva por versión, el progreso por palabra.
export const panalGame = pgTable(
  "panal_game",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    day: date({ mode: "string" }).notNull(),
    puzzleId: text().notNull(),
    dictionaryVersion: text().notNull(),
    rulesVersion: text().notNull(),
    creditedAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("panal_game_person_day_unique").on(t.personId, t.day),
    index("panal_game_term_idx").on(t.termId),
  ],
);

export const panalWord = pgTable(
  "panal_word",
  {
    id: id(),
    gameId: text()
      .notNull()
      .references(() => panalGame.id, { onDelete: "cascade" }),
    word: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("panal_word_game_word_unique").on(t.gameId, t.word),
    check("panal_word_format", sql`${t.word} ~ '^[A-ZÑ]{4,32}$'`),
  ],
);

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

// Partida de 2048 (ADR-075). La semilla la reparte el servidor y solo la ve su dueño; `moves` es la
// evidencia con la que el servidor rejuega la partida para calcular `score`. Se juega sin límite:
// el único parcial sobre `creditedAt` es lo que garantiza un solo crédito por día.
export const game2048Run = pgTable(
  "game2048_run",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    day: date({ mode: "string" }).notNull(),
    seed: text().notNull(),
    rulesVersion: text().notNull(),
    status: game2048Status().notNull().default("IN_PROGRESS"),
    startRequestId: text().notNull(),
    finishRequestId: text(),
    moves: text(),
    moveCount: integer().notNull().default(0),
    score: integer().notNull().default(0),
    maxTile: integer().notNull().default(0),
    creditedAt: timestampTz(),
    creditedPoints: integer(),
    finishedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Un solo crédito por persona y día, aunque dos pestañas cierren a la vez.
    uniqueIndex("game2048_run_person_day_credited_unique")
      .on(t.personId, t.day)
      .where(sql`${t.creditedAt} is not null`),
    // Una sola partida abierta por persona: pedir otra devuelve la que está a medias.
    uniqueIndex("game2048_run_person_open_unique")
      .on(t.personId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    uniqueIndex("game2048_run_start_request_unique").on(t.personId, t.startRequestId),
    uniqueIndex("game2048_run_finish_request_unique")
      .on(t.personId, t.finishRequestId)
      .where(sql`${t.finishRequestId} is not null`),
    index("game2048_run_person_day_idx").on(t.personId, t.day),
    index("game2048_run_term_idx").on(t.termId),
    check("game2048_run_seed_format", sql`${t.seed} ~ '^[0-9a-f]{16}$'`),
    // PostgreSQL limita el contador de repetición de una regex a 255, así que el largo va aparte.
    check(
      "game2048_run_moves_format",
      sql`${t.moves} is null or (${t.moves} ~ '^[UDLR]+$' and length(${t.moves}) <= 4000)`,
    ),
    check("game2048_run_move_count_range", sql`${t.moveCount} between 0 and 4000`),
    // El contador no puede separarse de la evidencia que lo sostiene.
    check(
      "game2048_run_move_count_matches",
      sql`${t.moves} is null or ${t.moveCount} = length(${t.moves})`,
    ),
    check("game2048_run_score_range", sql`${t.score} >= 0 and ${t.maxTile} >= 0`),
    check(
      "game2048_run_finished_consistent",
      sql`(${t.status} = 'IN_PROGRESS') = (${t.finishedAt} is null)`,
    ),
    check(
      "game2048_run_credit_consistent",
      sql`(${t.creditedAt} is null) = (${t.creditedPoints} is null)`,
    ),
    check("game2048_run_credit_finished", sql`${t.creditedAt} is null or ${t.status} = 'FINISHED'`),
    check(
      "game2048_run_credit_range",
      sql`${t.creditedPoints} is null or ${t.creditedPoints} between 1 and 6`,
    ),
  ],
);

// Partida de Sudoku (ADR-078). El servidor genera el tablero desde `seed`, que nunca sale de él, y
// guarda `solution`: al cerrar compara la cuadrícula enviada, sin replay. `assisted` se fija al crear
// la partida y decide si la solución viaja al navegador y si el premio es la mitad. Se juega sin
// límite: el único parcial sobre `creditedAt` es lo que garantiza un solo crédito por día.
export const sudokuRun = pgTable(
  "sudoku_run",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    day: date({ mode: "string" }).notNull(),
    seed: text().notNull(),
    rulesVersion: text().notNull(),
    difficulty: sudokuDifficulty().notNull(),
    assisted: boolean().notNull(),
    givens: text().notNull(),
    solution: text().notNull(),
    status: sudokuStatus().notNull().default("IN_PROGRESS"),
    startRequestId: text().notNull(),
    finishRequestId: text(),
    creditedAt: timestampTz(),
    creditedPoints: integer(),
    finishedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Un solo crédito por persona y día, aunque dos pestañas cierren a la vez.
    uniqueIndex("sudoku_run_person_day_credited_unique")
      .on(t.personId, t.day)
      .where(sql`${t.creditedAt} is not null`),
    // Una sola partida abierta por persona.
    uniqueIndex("sudoku_run_person_open_unique")
      .on(t.personId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    uniqueIndex("sudoku_run_start_request_unique").on(t.personId, t.startRequestId),
    uniqueIndex("sudoku_run_finish_request_unique")
      .on(t.personId, t.finishRequestId)
      .where(sql`${t.finishRequestId} is not null`),
    index("sudoku_run_person_day_idx").on(t.personId, t.day),
    index("sudoku_run_term_idx").on(t.termId),
    check("sudoku_run_seed_format", sql`${t.seed} ~ '^[0-9a-f]{16}$'`),
    check("sudoku_run_givens_format", sql`${t.givens} ~ '^[0-9]{81}$'`),
    check("sudoku_run_solution_format", sql`${t.solution} ~ '^[1-9]{81}$'`),
    check(
      "sudoku_run_finished_consistent",
      sql`(${t.status} = 'IN_PROGRESS') = (${t.finishedAt} is null)`,
    ),
    // Solo una partida resuelta lleva la solicitud de cierre: abandonar no tiene `requestId`.
    check(
      "sudoku_run_finish_request_consistent",
      sql`(${t.status} = 'SOLVED') = (${t.finishRequestId} is not null)`,
    ),
    check(
      "sudoku_run_credit_consistent",
      sql`(${t.creditedAt} is null) = (${t.creditedPoints} is null)`,
    ),
    check("sudoku_run_credit_solved", sql`${t.creditedAt} is null or ${t.status} = 'SOLVED'`),
    check(
      "sudoku_run_credit_range",
      sql`${t.creditedPoints} is null or ${t.creditedPoints} between 1 and 6`,
    ),
    // El modo con ayudas nunca paga más de la mitad, aunque el comando se equivoque.
    check(
      "sudoku_run_credit_assisted_cap",
      sql`${t.creditedPoints} is null or not ${t.assisted} or ${t.creditedPoints} <= 3`,
    ),
  ],
);

// Color (ADR-134): objetivos privados por partida y tres respuestas verificadas por servidor.
export const colorRun = pgTable(
  "color_run",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    day: date({ mode: "string" }).notNull(),
    rulesVersion: text().notNull(),
    status: colorStatus().notNull().default("IN_PROGRESS"),
    startRequestId: text().notNull(),
    targets: jsonb().$type<HslColor[]>().notNull(),
    round: integer().notNull().default(1),
    watchStartedAt: timestampTz().notNull(),
    nextRoundRequests: jsonb().$type<string[]>().notNull().default([]),
    results: jsonb()
      .$type<
        Array<{
          round: number;
          target: HslColor;
          answer: HslColor;
          accuracy: number;
          requestId: string;
        }>
      >()
      .notNull()
      .default([]),
    average: numeric({ precision: 4, scale: 1, mode: "number" }),
    creditedAt: timestampTz(),
    creditedPoints: integer(),
    finishedAt: timestampTz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("color_run_person_day_credited_unique")
      .on(t.personId, t.day)
      .where(sql`${t.creditedAt} is not null`),
    uniqueIndex("color_run_person_open_unique")
      .on(t.personId)
      .where(sql`${t.status} = 'IN_PROGRESS'`),
    uniqueIndex("color_run_start_request_unique").on(t.personId, t.startRequestId),
    index("color_run_person_day_idx").on(t.personId, t.day),
    index("color_run_term_idx").on(t.termId),
    check("color_run_round_range", sql`${t.round} between 1 and 3`),
    check(
      "color_run_targets_length",
      sql`jsonb_typeof(${t.targets}) = 'array' and jsonb_array_length(${t.targets}) = 3`,
    ),
    check(
      "color_run_results_length",
      sql`jsonb_typeof(${t.results}) = 'array' and jsonb_array_length(${t.results}) between 0 and 3`,
    ),
    check(
      "color_run_finished_consistent",
      sql`(${t.status} = 'IN_PROGRESS') = (${t.finishedAt} is null)`,
    ),
    check(
      "color_run_average_consistent",
      sql`(${t.status} = 'FINISHED') = (${t.average} is not null)`,
    ),
    check("color_run_average_range", sql`${t.average} is null or ${t.average} between 0 and 100`),
    check(
      "color_run_credit_consistent",
      sql`(${t.creditedAt} is null) = (${t.creditedPoints} is null)`,
    ),
    check("color_run_credit_finished", sql`${t.creditedAt} is null or ${t.status} = 'FINISHED'`),
    check(
      "color_run_credit_range",
      sql`${t.creditedPoints} is null or ${t.creditedPoints} between 1 and 6`,
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
    openedAt: timestampTz(),
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
    // Una elección de junta; las vueltas adicionales no tienen máximo (ADR-147).
    uniqueIndex("occasion_board_election_unique")
      .on(t.termId)
      .where(sql`${t.assemblyKind} = 'BOARD_ELECTION' and ${t.status} <> 'CANCELLED'`),
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
    // La presencia se conserva aunque una excusa aceptada cambie el estado del registro.
    attendanceExtent: attendanceExtent().default("FULL"),
    attendanceList: attendanceList(),
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
    check(
      "check_in_attendance_list_consistent",
      sql`(${t.attendanceExtent} is not distinct from 'PARTIAL') = (${t.attendanceList} is not null)`,
    ),
    check(
      "check_in_absence_is_excused",
      sql`${t.attendanceExtent} is not null or ${t.status} = 'EXCUSED'`,
    ),
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
    game2048RunId: text().references(() => game2048Run.id),
    sudokuRunId: text().references(() => sudokuRun.id),
    colorRunId: text().references(() => colorRun.id),
    panalGameId: text().references(() => panalGame.id),
    panalCheckpoint: integer(),
    rewardId: text().references((): AnyPgColumn => reward.id),
    presenceBonusId: text().references((): AnyPgColumn => presenceBonus.id),
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
    uniqueIndex("point_entry_presence_bonus_unique").on(t.presenceBonusId),
    uniqueIndex("point_entry_wordle_game_unique").on(t.wordleGameId),
    uniqueIndex("point_entry_game2048_run_unique").on(t.game2048RunId),
    uniqueIndex("point_entry_sudoku_run_unique").on(t.sudokuRunId),
    uniqueIndex("point_entry_color_run_unique").on(t.colorRunId),
    uniqueIndex("point_entry_panal_game_unique")
      .on(t.panalGameId)
      .where(sql`${t.panalCheckpoint} is null`),
    uniqueIndex("point_entry_panal_checkpoint_unique").on(t.panalGameId, t.panalCheckpoint),
    check(
      "point_entry_panal_consistent",
      sql`(${t.kind}::text = 'PANAL') = (${t.panalGameId} is not null)`,
    ),
    check(
      "point_entry_panal_checkpoint_consistent",
      sql`${t.panalCheckpoint} is null or (${t.kind}::text = 'PANAL' and ${t.panalCheckpoint} between 1 and 3)`,
    ),
    check(
      "point_entry_panal_reward",
      sql`${t.kind}::text <> 'PANAL' or (${t.panalCheckpoint} is null and ${t.points} = 6) or (${t.panalCheckpoint} is not null and ${t.points} = ${t.panalCheckpoint})`,
    ),
    // Un (rewardId, kind) por premio: el check de abajo limita rewardId a CHALLENGE y BOOST.
    // El predicado no compara el enum: un literal nuevo no se puede usar en la transacción del
    // ADD VALUE y el cast a text no es IMMUTABLE.
    uniqueIndex("point_entry_reward_kind_unique")
      .on(t.rewardId, t.kind)
      .where(sql`${t.rewardId} is not null`),
    uniqueIndex("point_entry_legacy_id_unique")
      .on(t.legacyId)
      .where(sql`${t.legacyId} is not null`),
    index("point_entry_person_term_idx").on(t.personId, t.termId),
    index("point_entry_term_created_idx").on(t.termId, t.createdAt),
    check("point_entry_nonzero", sql`${t.points} <> 0`),
    check(
      "point_entry_presence_bonus_consistent",
      sql`(${t.kind}::text = 'PRESENCE_STREAK') = (${t.presenceBonusId} is not null)`,
    ),
    check(
      "point_entry_presence_bonus_points",
      sql`${t.kind}::text <> 'PRESENCE_STREAK' or ${t.points} in (2, 3, 5)`,
    ),
    check(
      "point_entry_wordle_consistent",
      sql`(${t.kind}::text = 'WORDLE') = (${t.wordleGameId} is not null)`,
    ),
    check(
      "point_entry_wordle_reward",
      sql`${t.kind}::text <> 'WORDLE' or ${t.points} between 1 and 6`,
    ),
    check(
      "point_entry_game2048_consistent",
      sql`(${t.kind}::text = 'GAME2048') = (${t.game2048RunId} is not null)`,
    ),
    check(
      "point_entry_game2048_reward",
      sql`${t.kind}::text <> 'GAME2048' or ${t.points} between 1 and 6`,
    ),
    check(
      "point_entry_sudoku_consistent",
      sql`(${t.kind}::text = 'SUDOKU') = (${t.sudokuRunId} is not null)`,
    ),
    check(
      "point_entry_sudoku_reward",
      sql`${t.kind}::text <> 'SUDOKU' or ${t.points} between 1 and 6`,
    ),
    check(
      "point_entry_color_consistent",
      sql`(${t.kind}::text = 'COLOR') = (${t.colorRunId} is not null)`,
    ),
    check(
      "point_entry_color_reward",
      sql`${t.kind}::text <> 'COLOR' or ${t.points} between 1 and 6`,
    ),
    check(
      "point_entry_reversal_consistent",
      sql`(${t.kind} = 'REVERSAL') = (${t.reversalOfId} is not null)`,
    ),
    check(
      "point_entry_reward_consistent",
      sql`(${t.kind}::text in ('CHALLENGE', 'BOOST')) = (${t.rewardId} is not null)`,
    ),
    check(
      "point_entry_reward_range",
      sql`(${t.kind}::text <> 'CHALLENGE' or ${t.points} between 1 and 20)
        and (${t.kind}::text <> 'BOOST' or ${t.points} between 1 and 1000)`,
    ),
  ],
);

// Cada liquidación semanal es un hecho inmutable. Una corrección revierte su entrada y crea una
// versión nueva: ni el reconocimiento original ni sus puntos se editan.
export const presenceBonus = pgTable(
  "presence_bonus",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    weekKey: date({ mode: "string" }).notNull(),
    version: integer().notNull(),
    streakWeeks: integer().notNull(),
    points: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("presence_bonus_week_version_unique").on(
      t.personId,
      t.termId,
      t.weekKey,
      t.version,
    ),
    check("presence_bonus_positive_version", sql`${t.version} > 0`),
    check("presence_bonus_streak", sql`${t.streakWeeks} >= 2`),
    check("presence_bonus_points", sql`${t.points} in (2, 3, 5)`),
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
    topGamer: jsonb().$type<unknown>().notNull().default(sql`'[]'::jsonb`),
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

// Retos relámpago (ADR-067): `status` persiste DRAFT/PUBLISHED/CANCELLED; programado, abierto y
// vencido se derivan de `opensAt`/`closesAt`. Publicar congela formato, público, premio y umbral.
export const challenge = pgTable(
  "challenge",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    kind: challengeKind().notNull(),
    status: challengeStatus().notNull().default("DRAFT"),
    title: text().notNull(),
    description: text().notNull().default(""), // Markdown
    audience: challengeAudience().notNull().default("ALL"),
    audienceCommitteeIds: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    opensAt: timestampTz().notNull(),
    closesAt: timestampTz().notNull(),
    basePoints: integer().notNull().default(0),
    passPercent: integer(),
    // El reto presencial se completa con el check-in de esta ocasión dentro de la ventana.
    occasionId: text().references(() => occasion.id, { onDelete: "set null" }),
    publishedAt: timestampTz(),
    publishedById: text().references(() => person.id, { onDelete: "set null" }),
    cancelledAt: timestampTz(),
    cancelReason: text(),
    duplicatedFromId: text().references((): AnyPgColumn => challenge.id, {
      onDelete: "set null",
    }),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("challenge_term_status_idx").on(t.termId, t.status),
    index("challenge_occasion_idx").on(t.occasionId),
    check("challenge_window_ordered", sql`${t.opensAt} < ${t.closesAt}`),
    check("challenge_base_points_range", sql`${t.basePoints} between 0 and 20`),
    check(
      "challenge_pass_percent_range",
      sql`${t.passPercent} is null or ${t.passPercent} between 1 and 100`,
    ),
    check(
      "challenge_trivia_pass_percent",
      sql`(${t.kind} = 'TRIVIA') = (${t.passPercent} is not null)`,
    ),
    check(
      "challenge_presential_occasion",
      sql`(${t.kind} = 'PRESENTIAL') = (${t.occasionId} is not null)`,
    ),
    check(
      "challenge_committees_nonempty",
      sql`${t.audience} <> 'COMMITTEES' or (jsonb_typeof(${t.audienceCommitteeIds}) = 'array' and jsonb_array_length(${t.audienceCommitteeIds}) > 0)`,
    ),
    check(
      "challenge_cancel_reason",
      sql`(${t.status} = 'CANCELLED') = (${t.cancelReason} is not null)`,
    ),
  ],
);

// Preguntas de una trivia (ADR-067): `correctIndex` es privado y solo sale en la proyección
// cuando el reto está cerrado o cancelado.
export const challengeQuestion = pgTable(
  "challenge_question",
  {
    id: id(),
    challengeId: text()
      .notNull()
      .references(() => challenge.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    prompt: text().notNull(),
    options: jsonb().$type<string[]>().notNull(),
    correctIndex: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("challenge_question_ordinal_unique").on(t.challengeId, t.ordinal),
    check("challenge_question_ordinal_range", sql`${t.ordinal} between 1 and 5`),
    check(
      "challenge_question_options_range",
      sql`jsonb_typeof(${t.options}) = 'array' and jsonb_array_length(${t.options}) between 2 and 6`,
    ),
    check(
      "challenge_question_correct_index",
      sql`${t.correctIndex} >= 0 and ${t.correctIndex} < jsonb_array_length(${t.options})`,
    ),
  ],
);

// Una entrega por reto y persona; `requestId` absorbe reintentos de red (patrón del Wordle) y se guarda
// con su persona (`<persona>:<requestId>`, ADR-118 regla 18); las filas anteriores lo tienen sin ella.
export const challengeParticipation = pgTable(
  "challenge_participation",
  {
    id: id(),
    challengeId: text()
      .notNull()
      .references(() => challenge.id, { onDelete: "cascade" }),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    status: challengeParticipationStatus().notNull().default("PENDING"),
    requestId: text().notNull(),
    submittedAt: timestampTz().notNull().defaultNow(),
    answers: jsonb().$type<number[]>(),
    score: integer(),
    passed: boolean(),
    evidenceText: text(),
    checkInId: text().references(() => checkIn.id, { onDelete: "set null" }),
    rewardId: text().references((): AnyPgColumn => reward.id),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    decidedAt: timestampTz(),
    reason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("challenge_participation_unique").on(t.challengeId, t.personId),
    uniqueIndex("challenge_participation_request_unique").on(t.challengeId, t.requestId),
    index("challenge_participation_person_idx").on(t.personId, t.status),
    check(
      "challenge_participation_reason",
      sql`${t.status} <> 'REJECTED' or ${t.reason} is not null`,
    ),
  ],
);

// Imágenes de una misión con evidencia (ADR-067): fuera de `media_asset`; las sirve solo
// `/api/retos/evidencia/[id]` al autor o a un ADMIN, y solo en READY.
export const challengeEvidenceFile = pgTable(
  "challenge_evidence_file",
  {
    id: id(),
    participationId: text()
      .notNull()
      .references(() => challengeParticipation.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    objectKey: text().notNull(),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    status: evidenceFileStatus().notNull().default("PENDING"),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("challenge_evidence_object_key_unique").on(t.objectKey),
    uniqueIndex("challenge_evidence_ordinal_unique").on(t.participationId, t.ordinal),
    check("challenge_evidence_ordinal_range", sql`${t.ordinal} between 1 and 3`),
    check(
      "challenge_evidence_object_key_format",
      sql`${t.objectKey} ~ '^evidence/[a-z0-9]{10,40}/[a-z0-9]{10,40}\\.(jpg|png|webp)$'`,
    ),
  ],
);

// Campaña de puntos extra de GH (ADR-067): una fila por objetivo; al reservar aplica la activa
// de mayor porcentaje vigente sobre ese objetivo.
export const boostCampaign = pgTable(
  "boost_campaign",
  {
    id: id(),
    termId: text()
      .notNull()
      .references(() => term.id),
    name: text().notNull(),
    percent: integer().notNull(),
    challengeId: text().references(() => challenge.id, { onDelete: "cascade" }),
    occasionId: text().references(() => occasion.id, { onDelete: "cascade" }),
    startsAt: timestampTz().notNull(),
    endsAt: timestampTz().notNull(),
    status: boostCampaignStatus().notNull().default("ACTIVE"),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    cancelledAt: timestampTz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("boost_campaign_challenge_idx").on(t.challengeId),
    index("boost_campaign_occasion_idx").on(t.occasionId),
    index("boost_campaign_term_idx").on(t.termId),
    check("boost_campaign_percent", sql`${t.percent} in (25, 50, 100)`),
    check(
      "boost_campaign_single_target",
      sql`(${t.challengeId} is null) <> (${t.occasionId} is null)`,
    ),
    check("boost_campaign_window_ordered", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);

// Booster personal de un uso (ADR-067): Impulso (+50 %) o Superimpulso (+100 %); vence al
// terminar el término de emisión (EXPIRED es derivado) y nace de un nivel de insignia o de GH.
export const boosterItem = pgTable(
  "booster_item",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    kind: boosterKind().notNull(),
    status: boosterItemStatus().notNull().default("AVAILABLE"),
    expiresAt: timestampTz().notNull(),
    sourceAchievementId: text().references((): AnyPgColumn => achievement.id, {
      onDelete: "set null",
    }),
    targetChallengeId: text().references(() => challenge.id, { onDelete: "set null" }),
    targetOccasionId: text().references(() => occasion.id, { onDelete: "set null" }),
    consumedRewardId: text().references((): AnyPgColumn => reward.id, { onDelete: "set null" }),
    grantedById: text().references(() => person.id, { onDelete: "set null" }),
    grantReason: text(),
    revokedById: text().references(() => person.id, { onDelete: "set null" }),
    revokedAt: timestampTz(),
    revokeReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("booster_item_source_achievement_unique")
      .on(t.sourceAchievementId)
      .where(sql`${t.sourceAchievementId} is not null`),
    uniqueIndex("booster_item_person_challenge_unique")
      .on(t.personId, t.targetChallengeId)
      .where(sql`${t.targetChallengeId} is not null and ${t.status} <> 'REVOKED'`),
    uniqueIndex("booster_item_person_occasion_unique")
      .on(t.personId, t.targetOccasionId)
      .where(sql`${t.targetOccasionId} is not null and ${t.status} <> 'REVOKED'`),
    index("booster_item_person_status_idx").on(t.personId, t.status),
    check(
      "booster_item_single_target",
      sql`not (${t.targetChallengeId} is not null and ${t.targetOccasionId} is not null)`,
    ),
    check(
      "booster_item_revoked_consistent",
      sql`(${t.status} = 'REVOKED') = (${t.revokedAt} is not null)`,
    ),
  ],
);

// Premio calculado en servidor (ADR-067): día y semana de Colombia (la semana empieza el lunes)
// y el snapshot de los topes se fijan al reservar. El cupo cuenta RESERVED, GRANTED y REVERSED.
export const reward = pgTable(
  "reward",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    termId: text()
      .notNull()
      .references(() => term.id),
    source: rewardSource().notNull(),
    participationId: text().references(() => challengeParticipation.id, {
      onDelete: "set null",
    }),
    checkInId: text().references(() => checkIn.id, { onDelete: "set null" }),
    basePoints: integer().notNull(),
    personalPercent: integer().notNull().default(0),
    requestedPersonalPercent: integer().notNull().default(0),
    campaignPercent: integer().notNull().default(0),
    campaignId: text().references(() => boostCampaign.id, { onDelete: "set null" }),
    boosterItemId: text().references(() => boosterItem.id, { onDelete: "set null" }),
    baseGranted: integer().notNull(),
    extraPoints: integer().notNull(),
    status: rewardStatus().notNull().default("RESERVED"),
    dayKey: date({ mode: "string" }).notNull(),
    weekKey: date({ mode: "string" }).notNull(),
    capDaily: integer().notNull(),
    capWeekly: integer().notNull(),
    reservedAt: timestampTz().notNull().defaultNow(),
    decidedAt: timestampTz(),
    decidedById: text().references(() => person.id, { onDelete: "set null" }),
    reason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reward_participation_unique")
      .on(t.participationId)
      .where(sql`${t.participationId} is not null`),
    uniqueIndex("reward_check_in_unique").on(t.checkInId).where(sql`${t.checkInId} is not null`),
    index("reward_person_day_idx").on(t.personId, t.dayKey),
    index("reward_person_week_idx").on(t.personId, t.weekKey),
    index("reward_term_status_idx").on(t.termId, t.status),
    check(
      "reward_challenge_source",
      sql`(${t.source} = 'CHALLENGE') = (${t.participationId} is not null)`,
    ),
    check("reward_checkin_source", sql`(${t.source} = 'CHECKIN') = (${t.checkInId} is not null)`),
    // ADR-087: la base de una asistencia viene de la ocasión; el máximo 20 es de los retos.
    check(
      "reward_base_points_range",
      sql`${t.basePoints} >= 0 and (${t.source} <> 'CHALLENGE' or ${t.basePoints} <= 20)`,
    ),
    check("reward_personal_percent", sql`${t.personalPercent} in (0, 50, 100)`),
    check("reward_requested_personal_percent", sql`${t.requestedPersonalPercent} in (0, 50, 100)`),
    check("reward_campaign_percent", sql`${t.campaignPercent} in (0, 25, 50, 100)`),
    check("reward_base_granted_range", sql`${t.baseGranted} between 0 and ${t.basePoints}`),
    check("reward_extra_nonnegative", sql`${t.extraPoints} >= 0`),
    check("reward_reserved_consistent", sql`(${t.status} = 'RESERVED') = (${t.decidedAt} is null)`),
  ],
);

// Catálogo de insignias en datos (ADR-067): la migración siembra las cuatro familias; GH crea
// ediciones especiales vinculadas a una ocasión o a un reto.
export const badgeDefinition = pgTable(
  "badge_definition",
  {
    id: id(),
    code: text().notNull(),
    family: badgeFamily().notNull(),
    level: integer().notNull().default(1),
    threshold: integer(),
    name: text().notNull(),
    description: text().notNull().default(""),
    unlockHint: text().notNull().default(""),
    active: boolean().notNull().default(true),
    specialChallengeId: text().references(() => challenge.id, { onDelete: "set null" }),
    specialOccasionId: text().references(() => occasion.id, { onDelete: "set null" }),
    termId: text().references(() => term.id),
    createdById: text().references(() => person.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("badge_definition_code_unique").on(t.code),
    uniqueIndex("badge_definition_family_level_unique")
      .on(t.family, t.level)
      .where(sql`${t.family} <> 'SPECIAL'`),
    check("badge_definition_level_range", sql`${t.level} between 1 and 3`),
    check(
      "badge_definition_special_threshold",
      sql`(${t.family} = 'SPECIAL') = (${t.threshold} is null)`,
    ),
    check(
      "badge_definition_special_target",
      sql`${t.family} <> 'SPECIAL' or (${t.specialChallengeId} is not null) <> (${t.specialOccasionId} is not null)`,
    ),
  ],
);

// Insignia desbloqueada por una persona (ADR-067): `historical` viene de la conciliación y no da
// booster ni push; `featuredPosition` (1 a 3) destaca hasta tres en el directorio.
export const achievement = pgTable(
  "achievement",
  {
    id: id(),
    personId: text()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    badgeId: text()
      .notNull()
      .references(() => badgeDefinition.id),
    unlockedAt: timestampTz().notNull().defaultNow(),
    termId: text().references(() => term.id),
    // CHECKIN, CHALLENGE, WORDLE, OCCASION, HISTORICAL o MANUAL; `sourceRef` apunta al hecho.
    sourceKind: text().notNull(),
    sourceRef: text(),
    historical: boolean().notNull().default(false),
    seenAt: timestampTz(),
    featuredPosition: integer(),
    revokedAt: timestampTz(),
    revokeReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("achievement_person_badge_unique")
      .on(t.personId, t.badgeId)
      .where(sql`${t.revokedAt} is null`),
    uniqueIndex("achievement_featured_unique")
      .on(t.personId, t.featuredPosition)
      .where(sql`${t.featuredPosition} is not null`),
    index("achievement_person_idx").on(t.personId),
    check(
      "achievement_featured_range",
      sql`${t.featuredPosition} is null or ${t.featuredPosition} between 1 and 3`,
    ),
  ],
);

// Corrida de la conciliación histórica (ADR-067): reanudable por `cursor` (personId) en lotes
// de cien; DRY_RUN informa sin escribir.
export const badgeReconciliationRun = pgTable("badge_reconciliation_run", {
  id: id(),
  mode: reconciliationMode().notNull(),
  status: reconciliationStatus().notNull().default("RUNNING"),
  cursor: text(),
  processed: integer().notNull().default(0),
  unlocked: integer().notNull().default(0),
  revoked: integer().notNull().default(0),
  report: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  startedById: text().references(() => person.id, { onDelete: "set null" }),
  startedAt: timestampTz().notNull().defaultNow(),
  finishedAt: timestampTz(),
  error: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
