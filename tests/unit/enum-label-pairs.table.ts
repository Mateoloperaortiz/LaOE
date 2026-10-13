// La tabla de tests/unit/enum-label-pairs.test.ts: cada par de un orden de valores (un enum, o la
// tupla que hace sus veces) y una lista del catálogo de textos que el código empareja por posición
// (DT-011, ADR-126 regla 1). `positions` dice qué posición LITERAL de la lista lee hoy cada valor.
// No se compara ninguna redacción: un texto de docs/14-copy-y-textos.md cambia sin tocar esta tabla.
import { areaLabel } from "@/app/admin/comites/[slug]/_ui/Areas";
import { END_REASONS, TABS, TIMELINE_FILTERS } from "@/app/admin/personas/[id]/_ui/etiquetas";
import {
  campaignStatusLabel,
  channelLabel,
  kindLabel,
  statusLabel as messageStatusLabel,
  quotaProviderLabel,
  quotaReasonLabel,
} from "@/modules/comms/admin";
import {
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
  SKIP_REASONS,
} from "@/modules/comms/domain/campaigns";
import { MARKET_STATUSES } from "@/modules/competition/domain/betting-pure";
import { powerName } from "@/modules/competition/domain/powers";
import { POWER_EFFECTS, POWER_TYPES } from "@/modules/competition/domain/powers-pure";
import { SCHEDULE_ISSUE_KINDS } from "@/modules/competition/domain/schedule-pure";
import { COMPETITION_STATUSES } from "@/modules/competition/domain/setup";
import { STAFF_SHEET_ROLES } from "@/modules/competition/domain/staff-import-pure";
import { DOCUMENT_KINDS } from "@/modules/content/domain/documents-pure";
import {
  CALL_ENTRY_STATUSES,
  CALL_SELECTIONS,
  CALL_STATUSES,
} from "@/modules/crm/domain/calls-pure";
import { ORGANIZATION_KINDS } from "@/modules/crm/domain/organizations";
import { PIPELINE_KINDS } from "@/modules/crm/domain/pipelines-pure";
import { awardLabel, OE_AWARDS } from "@/modules/crm/domain/recognitions";
import {
  excuseCauseLabel,
  requestKindLabel,
  requestStatusLabel,
} from "@/modules/crm/domain/requests";
import { EXCUSE_CAUSES, REQUEST_KINDS, REQUEST_STATUSES } from "@/modules/crm/domain/requests-pure";
import { approvalStatusLabel } from "@/modules/finance/domain/approvals";
import {
  APPROVAL_STATUSES,
  APPROVERS,
  BUDGET_KINDS,
  BUDGET_STATUSES,
} from "@/modules/finance/domain/budget-pure";
import { budgetKindLabel, budgetStatusLabel } from "@/modules/finance/domain/budgets";
import { FIELD_TYPES } from "@/modules/forms/domain/pure";
import { occasionStatusCell } from "@/modules/participation/admin";
import { CHECK_IN_SOURCES, CHECK_IN_STATUSES } from "@/modules/participation/domain/check-in-pure";
import { checkInStatusLabel } from "@/modules/participation/domain/check-in-transition";
import { VIABILITY_ALERTS } from "@/modules/participation/domain/committee-viability-pure";
import { POINT_ENTRY_KINDS } from "@/modules/participation/domain/ledger-pure";
import {
  ASSEMBLY_KINDS,
  OCCASION_CATEGORIES,
  OCCASION_KINDS,
  OCCASION_STATUSES,
} from "@/modules/participation/domain/occasion-pure";
import {
  BADGE_FAMILIES,
  BOOSTER_KINDS,
  BOOSTER_STATES,
  CHALLENGE_KINDS,
} from "@/modules/participation/gamification-types";
import {
  challengeParticipationStatus,
  occasionApproval,
  reconciliationStatus,
  rewardStatus,
} from "@/modules/participation/schema";
import { SUDOKU_DIFFICULTIES } from "@/modules/participation/sudoku-engine";
import { statusLabel as memberStatusLabel, stageLabel } from "@/modules/people/admin";
import { APPOINTMENT_KINDS, appointmentLabel } from "@/modules/people/domain/appointments";
import { COMMITTEE_AREA_KEYS, COMMITTEE_CAPABILITIES } from "@/modules/people/domain/capabilities";
import { CONSENT_PURPOSES } from "@/modules/people/domain/consents";
import { INHABILITY_CODES, inhabilityLabels } from "@/modules/people/domain/inhabilities-pure";
import { SANCTION_KINDS } from "@/modules/people/domain/sanction-pure";
import { sanctionKindLabel } from "@/modules/people/domain/sanctions";
import { CLOSING_FILTERS } from "@/modules/permanence/domain/closing";
import { COMPLIANCE_FILTERS } from "@/modules/permanence/domain/compliance";
import {
  APPLIES_TO,
  COMMITTEE_FILTERS,
  COMPUTATIONS,
  GROUP_MODES,
  NEW_MEMBERS_FILTERS,
  WORK_GROUP_KINDS,
} from "@/modules/permanence/domain/params";
import { COMPLIANCE_STATES } from "@/modules/permanence/domain/snapshot-pure";
import { TEAM_AREA_CODES, teamAreaLabel } from "@/modules/permanence/domain/team-areas";
import { tLabels, type tList } from "@/shared/copy";

const LABELS = {
  appointment: (value) => appointmentLabel({ kind: value as never, title: null }),
  area: (value) => areaLabel(value as never),
  approvalStatus: (value) => approvalStatusLabel(value as never),
  award: (value) => awardLabel(value),
  budgetKind: (value) => budgetKindLabel(value as never),
  budgetStatus: (value) => budgetStatusLabel(value as never),
  campaignStatus: (value) => campaignStatusLabel(value),
  channel: (value) => channelLabel(value),
  checkInStatus: (value) => checkInStatusLabel(value as never),
  excuseCause: (value) => excuseCauseLabel(value),
  inhability: (value) =>
    inhabilityLabels([value as never], tLabels("T-2281", INHABILITY_CODES))[0] ?? "",
  memberStatus: (value) => memberStatusLabel(value),
  messageKind: (value) => kindLabel(value),
  messageStatus: (value) => messageStatusLabel(value),
  occasionStatus: (value) => occasionStatusCell(value as never).text,
  power: (value) => powerName(value as never),
  quotaProvider: (value) => quotaProviderLabel(value),
  quotaReason: (value) => quotaReasonLabel(value),
  requestKind: (value) => requestKindLabel(value as never),
  requestStatus: (value) => requestStatusLabel(value as never),
  sanctionKind: (value) => sanctionKindLabel(value as never),
  stage: (value) => stageLabel(value),
  teamArea: (value) => teamAreaLabel(value),
} satisfies Record<string, (value: string) => string>;

type ListCode = Parameters<typeof tList>[0];

export type LabelPair = {
  /** La lista del catálogo de textos. */
  code: ListCode;
  /** Cómo se llama el orden en el código, para leer el título de la prueba. */
  order: string;
  /** La posición de la lista que le toca a cada valor. */
  positions: Record<string, number>;
  /** La tupla exportada, cuando los sitios comparten una. */
  canonical?: readonly string[];
  /** La función de producción que devuelve la etiqueta de un valor, cuando se puede llamar. */
  label?: (value: string) => string;
  /** Los archivos que escriben su propia copia del orden, como arreglo literal. */
  copies?: readonly string[];
};

/** Los pares uno a uno que salen de las expresiones de la spec #242 (indexOf en el subíndice,
 * recorrido por índice de una constante en mayúsculas, índice en constante y `zip`). */
export const PAIRS: readonly LabelPair[] = [
  {
    code: "T-085",
    order: "POINT_ENTRY_KINDS",
    positions: {
      CHECKIN: 0,
      ADJUSTMENT: 1,
      REVERSAL: 2,
      LEGACY: 3,
      WORDLE: 4,
      CHALLENGE: 5,
      BOOST: 6,
      GAME2048: 7,
      SUDOKU: 8,
      PANAL: 9,
    },
    canonical: POINT_ENTRY_KINDS,
  },
  {
    code: "T-133",
    order: "SECCIONES",
    positions: {
      "mis-datos": 0,
      notificaciones: 1,
      calendario: 2,
      sesiones: 3,
      consentimientos: 4,
      privacidad: 5,
    },
    copies: ["src/app/app/ajustes/page.tsx"],
  },
  {
    code: "T-289",
    order: "PERMISSION_CODES",
    positions: { ADMIN: 0, COMMITTEE_LEADER: 1, BOARD: 2 },
    copies: ["src/modules/crm/jobs.ts"],
  },
  {
    code: "T-381",
    order: "STATUS_CODES",
    positions: { ACTIVE: 0, ON_LEAVE: 1, HONORARY: 2, INACTIVE: 3 },
    label: LABELS.memberStatus,
    copies: [
      "src/modules/people/admin.ts",
      "src/modules/permanence/components/Desglose.tsx",
      "src/app/app/_ui/PersonaTarjeta.tsx",
      "src/modules/crm/jobs.ts",
    ],
  },
  {
    code: "T-394",
    order: "DOCUMENT_KINDS",
    positions: { ESTATUTOS: 0, REGLAMENTO: 1, ACTA: 2, OTRO: 3 },
    canonical: DOCUMENT_KINDS,
  },
  {
    code: "T-429",
    order: "STAGE_CODES",
    positions: { PROSPECT: 0, APPLICANT: 1, MEMBER: 2, ALUMNI: 3 },
    label: LABELS.stage,
    copies: ["src/modules/people/admin.ts"],
  },
  {
    code: "T-432",
    order: "TABS",
    positions: {
      resumen: 0,
      linea: 1,
      membresia: 2,
      participacion: 3,
      permanencia: 4,
      formularios: 5,
      comunicaciones: 6,
      tareas: 7,
      solicitudes: 8,
      datos: 9,
    },
    canonical: TABS,
  },
  {
    code: "T-436",
    order: "END_REASONS",
    positions: {
      GRADUATION: 0,
      RESIGNATION: 1,
      PERMANENCE: 2,
      EXPULSION: 3,
      STUDENT_STATUS_LOST: 4,
      OTHER: 5,
    },
    canonical: END_REASONS,
  },
  {
    code: "T-444",
    order: "APPOINTMENT_KINDS",
    positions: {
      PRESIDENT: 0,
      VP_GH: 1,
      VP_PUBLIC_RELATIONS: 2,
      VP_ADMIN: 3,
      VP_FINANCE: 4,
      VP_COMMUNICATIONS: 5,
      GH_HEAD: 6,
      GH_DIRECTOR: 7,
      MACROEVENT_DIRECTOR: 8,
      OTHER: 9,
    },
    canonical: APPOINTMENT_KINDS,
    label: LABELS.appointment,
  },
  {
    code: "T-469",
    order: "ENTRY_CODES",
    positions: { ANY: 0, NEW: 1, VETERAN: 2 },
    copies: ["src/modules/people/admin.ts"],
  },
  {
    code: "T-470",
    order: "CONSENT_CODES",
    positions: { ANY: 0, COMMS_YES: 1, COMMS_NO: 2, PHOTO_YES: 3, MEMORIAL_YES: 4 },
    copies: ["src/modules/people/admin.ts"],
  },
  {
    code: "T-516",
    order: "CONSENT_PURPOSES",
    positions: {
      MEMBERSHIP: 0,
      COMMUNICATIONS: 1,
      DIRECTORY_PHOTO: 2,
      MEMORIAL: 3,
      DATA_PROCESSING: 4,
    },
    canonical: CONSENT_PURPOSES,
  },
  {
    code: "T-521",
    order: "OCCASION_CATEGORIES",
    positions: {
      INTEGRATION: 0,
      ATHLETIC_MATCH: 1,
      COMMITTEE_MEETING: 2,
      TALK: 3,
      WORKSHOP: 4,
      SOCIAL: 5,
      OTHER: 6,
      INDUCTION: 7,
    },
    canonical: OCCASION_CATEGORIES,
  },
  {
    code: "T-546",
    order: "ASSEMBLY_KINDS",
    positions: { ORDINARY: 0, BOARD_ELECTION: 1, RUNOFF: 2 },
    canonical: ASSEMBLY_KINDS,
  },
  {
    code: "T-564",
    order: "OCCASION_KINDS",
    positions: { ACTIVITY: 0, ASSEMBLY: 1, EDITION_SESSION: 2 },
    canonical: OCCASION_KINDS,
    copies: ["src/app/admin/permanencia/_ui/reglas.ts"],
  },
  {
    code: "T-565",
    order: "ASSEMBLY_KINDS",
    positions: { ORDINARY: 0, BOARD_ELECTION: 1, RUNOFF: 2 },
    canonical: ASSEMBLY_KINDS,
  },
  {
    code: "T-566",
    order: "OCCASION_CATEGORIES",
    positions: {
      INTEGRATION: 0,
      ATHLETIC_MATCH: 1,
      COMMITTEE_MEETING: 2,
      TALK: 3,
      WORKSHOP: 4,
      SOCIAL: 5,
      OTHER: 6,
      INDUCTION: 7,
    },
    canonical: OCCASION_CATEGORIES,
  },
  {
    code: "T-568",
    order: "OCCASION_STATUSES",
    positions: { DRAFT: 0, OPEN: 1, CLOSED: 2, CANCELLED: 3 },
    canonical: OCCASION_STATUSES,
    label: LABELS.occasionStatus,
  },
  {
    code: "T-596",
    order: "CHECK_IN_SOURCES",
    positions: { SELF_QR: 0, HOST: 1, ADMIN: 2, IMPORT: 3 },
    canonical: CHECK_IN_SOURCES,
  },
  {
    code: "T-597",
    order: "CHECK_IN_STATUSES",
    positions: { PENDING: 0, APPROVED: 1, REJECTED: 2, CANCELLED: 3, EXCUSED: 4 },
    canonical: CHECK_IN_STATUSES,
    label: LABELS.checkInStatus,
  },
  {
    code: "T-717",
    order: "APPLIES_TO",
    positions: { ALL: 0, NEW: 1, VETERAN: 2 },
    canonical: APPLIES_TO,
  },
  {
    code: "T-718",
    order: "COMPUTATIONS",
    positions: {
      CHECKIN_COUNT: 0,
      CHECKIN_THRESHOLD: 1,
      CHECKIN_RATE: 2,
      GROUP_EVALUATED: 3,
      COMPOSITE: 4,
      LEADER_SCORE: 5,
      MANUAL: 6,
    },
    canonical: COMPUTATIONS,
  },
  {
    code: "T-719",
    order: "COMPUTATIONS",
    positions: {
      CHECKIN_COUNT: 0,
      CHECKIN_THRESHOLD: 1,
      CHECKIN_RATE: 2,
      GROUP_EVALUATED: 3,
      COMPOSITE: 4,
      LEADER_SCORE: 5,
      MANUAL: 6,
    },
    canonical: COMPUTATIONS,
  },
  {
    code: "T-725",
    order: "WORK_GROUP_KINDS",
    positions: {
      WORK_COMMITTEE: 0,
      GT_MACROEVENT: 1,
      GAP: 2,
      GAP_OE: 3,
      BARRA_BRAVA: 4,
      NEW_MEMBER_TASK: 5,
    },
    canonical: WORK_GROUP_KINDS,
  },
  {
    code: "T-750",
    order: "EVALUATIONS",
    positions: { PENDING: 0, GOOD: 1, INSUFFICIENT: 2 },
    copies: [
      "src/modules/permanence/components/Desglose.tsx",
      "src/modules/permanence/components/TeamParticipations.tsx",
      "src/app/admin/macroeventos/[slug]/_ui/Team.tsx",
      "src/app/admin/permanencia/evaluaciones/page.tsx",
      "src/app/admin/permanencia/grupos/[id]/page.tsx",
    ],
  },
  {
    code: "T-791",
    order: "STATES",
    positions: { EN_CAMINO: 0, EN_RIESGO: 1, NO_ALCANZA: 2, CUMPLE: 3, PRUEBA: 4, NO_CUMPLE: 5 },
    canonical: COMPLIANCE_STATES,
    copies: ["src/modules/permanence/domain/snapshot-pure.ts"],
  },
  {
    code: "T-792",
    order: "CONDITIONS",
    positions: { ACTIVE: 0, NEW: 1, PROBATION: 2, TRANSFER: 3 },
    copies: [
      "src/modules/permanence/components/Desglose.tsx",
      "src/modules/permanence/admin.ts",
      "src/app/admin/permanencia/cumplimiento/page.tsx",
      "src/app/admin/comites/[slug]/permanencia/page.tsx",
    ],
  },
  {
    code: "T-802",
    order: "DECISIONS",
    positions: { CONTINUES: 0, PROBATION: 1, EXIT_COMMITTEE: 2, EXIT_OE: 3 },
    copies: [
      "src/app/admin/permanencia/cierre/page.tsx",
      "src/app/admin/personas/[id]/_ui/TabPermanencia.tsx",
      "src/modules/crm/jobs.ts",
    ],
  },
  {
    code: "T-876",
    order: "REQUEST_STATUSES",
    positions: { PENDING: 0, APPROVED: 1, REJECTED: 2, WITHDRAWN: 3 },
    canonical: REQUEST_STATUSES,
    label: LABELS.requestStatus,
  },
  {
    code: "T-894",
    order: "REQUEST_KINDS",
    positions: { LEAVE: 0, RESIGNATION: 1, TRANSFER: 2, EXCUSE: 3 },
    canonical: REQUEST_KINDS,
    label: LABELS.requestKind,
  },
  {
    code: "T-899",
    order: "CALL_ENTRY_STATUSES",
    positions: { APPLIED: 0, ACCEPTED: 1, WAITLISTED: 2, REJECTED: 3 },
    canonical: CALL_ENTRY_STATUSES,
  },
  {
    code: "T-924",
    order: "FIELD_TYPES",
    positions: {
      TEXT: 0,
      TEXTAREA: 1,
      EMAIL: 2,
      PHONE: 3,
      SELECT: 4,
      MULTISELECT: 5,
      CHECKBOX: 6,
      DATE: 7,
      RATING: 8,
    },
    canonical: FIELD_TYPES,
  },
  {
    code: "T-949",
    order: "ORGANIZATION_KINDS",
    positions: { COMPANY: 0, EAFIT_UNIT: 1, STUDENT_GROUP: 2, OTHER: 3 },
    canonical: ORGANIZATION_KINDS,
  },
  {
    code: "T-964",
    order: "PIPELINE_KINDS",
    positions: { ADMISSION: 0, SPONSORSHIP: 1, CUSTOM: 2 },
    canonical: PIPELINE_KINDS,
  },
  {
    code: "T-1018",
    order: "CALL_SELECTIONS",
    positions: { FIRST_COME: 0, MANUAL: 1 },
    canonical: CALL_SELECTIONS,
  },
  {
    code: "T-1019",
    order: "CALL_STATUSES",
    positions: { DRAFT: 0, OPEN: 1, CLOSED: 2 },
    canonical: CALL_STATUSES,
  },
  {
    code: "T-1047",
    order: "STAGE_CODES",
    positions: { PROSPECT: 0, APPLICANT: 1, MEMBER: 2, ALUMNI: 3 },
    copies: ["src/modules/crm/jobs.ts"],
  },
  {
    code: "T-1127",
    order: "CAMPAIGN_STATUSES",
    positions: { DRAFT: 0, SCHEDULED: 1, SENDING: 2, SENT: 3, CANCELLED: 4 },
    canonical: CAMPAIGN_STATUSES,
    label: LABELS.campaignStatus,
  },
  {
    code: "T-1135",
    order: "RECIPIENT_STATUSES",
    positions: { PENDING: 0, SENT: 1, FAILED: 2, SKIPPED: 3 },
    canonical: RECIPIENT_STATUSES,
  },
  {
    code: "T-1136",
    order: "SKIP_REASONS",
    positions: { NO_EMAIL: 0, OPTED_OUT: 1, NO_CONSENT: 2, CANCELLED: 3, ANONYMIZED: 4 },
    canonical: SKIP_REASONS,
  },
  {
    code: "T-1145",
    order: "CHANNELS",
    positions: { EMAIL: 0, PUSH: 1 },
    label: LABELS.channel,
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-1146",
    order: "MESSAGE_KINDS",
    positions: {
      TRANSACTIONAL: 0,
      ANNOUNCEMENT: 1,
      POINTS: 2,
      REMINDER: 3,
      SURVEY: 4,
      CAMPAIGN: 5,
    },
    label: LABELS.messageKind,
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-1147",
    order: "STATUSES",
    positions: { SENT: 0, FAILED: 1 },
    label: LABELS.messageStatus,
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-1150",
    order: "PROVIDERS",
    positions: { console: 0, resend: 1, ses: 2, webpush: 3 },
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-2179",
    order: "COMMITTEE_CAPABILITIES",
    positions: {
      ROSTER: 0,
      DIRECTION: 1,
      PERMANENCE: 2,
      OCCASIONS: 3,
      EVENTS: 4,
      BOARD: 5,
      PROFILE: 6,
      PARTNERS: 7,
      FINANCE: 8,
    },
    canonical: COMMITTEE_CAPABILITIES,
  },
  {
    code: "T-2202",
    order: "BUDGET_STATUSES",
    positions: { DRAFT: 0, OPEN: 1, CLOSED: 2 },
    canonical: BUDGET_STATUSES,
    label: LABELS.budgetStatus,
  },
  {
    code: "T-2215",
    order: "EXCUSE_CAUSES",
    positions: {
      ACADEMIC: 0,
      MEDICAL_APPOINTMENT: 1,
      MEDICAL_LEAVE: 2,
      EMERGENCY: 3,
      BEREAVEMENT: 4,
      WORK: 5,
      INSTITUTIONAL: 6,
      MOBILITY: 7,
      FAMILY: 8,
      LEGAL: 9,
      REPRESENTATION: 10,
      TECHNICAL: 11,
      SAFETY: 12,
      FORCE_MAJEURE: 13,
    },
    canonical: EXCUSE_CAUSES,
    label: LABELS.excuseCause,
  },
  {
    code: "T-2229",
    order: "SANCTION_KINDS",
    positions: { WARNING: 0, MINOR: 1, MAJOR: 2, SUSPENSION: 3, OFFICE_BAN: 4 },
    canonical: SANCTION_KINDS,
    label: LABELS.sanctionKind,
  },
  {
    code: "T-2243",
    order: "SANCTION_STATES",
    positions: { LIVE: 0, EXPIRED: 1, REVOKED: 2 },
    copies: ["src/modules/people/domain/sanctions.ts"],
  },
  {
    code: "T-2264",
    order: "VIABILITY_ALERTS",
    positions: {
      FEW_DIRECTIONS: 0,
      MISSING_REQUIRED: 1,
      FEW_MEMBERS: 2,
      ABSENCES: 3,
      NO_EVENT: 4,
      TRIAL_FEW_MEMBERS: 5,
      TRIAL_LOW_ATTENDANCE: 6,
      TRIAL_ENDING: 7,
    },
    canonical: VIABILITY_ALERTS,
  },
  {
    code: "T-2281",
    order: "INHABILITY_CODES",
    positions: {
      OFFICE_BAN: 0,
      BOARD: 1,
      NEW_MEMBER: 2,
      TWO_MACROEVENTS: 3,
      TWO_GENERAL: 4,
      TWO_FINANCIERO: 5,
      MAX_ROLES: 6,
      NEEDS_CODIRECTION: 7,
    },
    canonical: INHABILITY_CODES,
    label: LABELS.inhability,
  },
  {
    code: "T-2286",
    order: "BUDGET_KINDS",
    positions: { ORDINARY: 0, EXTRAORDINARY: 1 },
    canonical: BUDGET_KINDS,
    label: LABELS.budgetKind,
  },
  {
    code: "T-2300",
    order: "APPROVAL_STATUSES",
    positions: { PENDING: 0, APPROVED: 1, REJECTED: 2 },
    canonical: APPROVAL_STATUSES,
    label: LABELS.approvalStatus,
  },
  {
    code: "T-2304",
    order: "APPROVERS",
    positions: { STUDENT_DEVELOPMENT: 0, VP_FINANCE: 1 },
    canonical: APPROVERS,
  },
  {
    code: "T-2320",
    order: "OE_AWARDS",
    positions: {
      BEST_GENERAL: 0,
      BEST_FINANCE: 1,
      BEST_GH: 2,
      BEST_LOGISTICS: 3,
      BEST_PUBLIC_RELATIONS: 4,
      BEST_MARKETING: 5,
      BEST_BOARD: 6,
      BEST_NEW_MEMBER: 7,
      BEST_ACADEMIC_EVENT: 8,
      BEST_CULTURAL_EVENT: 9,
      BEST_SOCIAL_EVENT: 10,
      BEST_SPORTS_EVENT: 11,
      BEST_RECREATIONAL_EVENT: 12,
      BEST_COMMITTEE: 13,
      BEST_CAREER_WEEK: 14,
      REVELATION_COMMITTEE: 15,
    },
    canonical: OE_AWARDS,
    label: LABELS.award,
  },
  {
    code: "T-2376",
    order: "TEAM_AREA_CODES",
    positions: {
      GENERAL: 0,
      PUBLICIDAD: 1,
      LOGISTICA: 2,
      FINANZAS: 3,
      RELACIONES_PUBLICAS: 4,
      MERCADEO: 5,
      GESTION_HUMANA: 6,
      AGENDA_ACADEMICA: 7,
      SEGURIDAD: 8,
      CARNIVAL: 9,
      THE_GAMES: 10,
    },
    canonical: TEAM_AREA_CODES,
    label: LABELS.teamArea,
  },
  {
    code: "T-2409",
    order: "CHALLENGE_KINDS",
    positions: { PRESENTIAL: 0, TRIVIA: 1, EVIDENCE: 2 },
    canonical: CHALLENGE_KINDS,
  },
  {
    code: "T-2410",
    order: "MEMBER_CHALLENGE_STATES",
    positions: { AVAILABLE: 0, SENT: 1, PENDING: 2, COMPLETED: 3, REJECTED: 4, EXPIRED: 5 },
    copies: [
      "src/app/admin/gamificacion/revision/page.tsx",
      "src/app/admin/gamificacion/retos/[id]/page.tsx",
    ],
  },
  {
    code: "T-2411",
    order: "AUDIENCES",
    positions: { ALL: 0, NEW: 1, VETERAN: 2, COMMITTEES: 3 },
    copies: ["src/modules/participation/components/ChallengeEditor.tsx"],
  },
  {
    code: "T-2451",
    order: "BOOSTER_KINDS",
    positions: { PLUS_50: 0, PLUS_100: 1 },
    canonical: BOOSTER_KINDS,
  },
  {
    code: "T-2455",
    order: "BOOSTER_STATES",
    positions: { AVAILABLE: 0, RESERVED: 1, CONSUMED: 2, EXPIRED: 3, REVOKED: 4 },
    canonical: BOOSTER_STATES,
  },
  {
    code: "T-2473",
    order: "BADGE_FAMILIES",
    positions: { EN_PARCHE: 0, EXPLORADOR: 1, RELAMPAGO: 2, PALABRA_A_PALABRA: 3, SPECIAL: 4 },
    canonical: BADGE_FAMILIES,
  },
  {
    code: "T-2511",
    order: "CHALLENGE_STATES",
    positions: { DRAFT: 0, SCHEDULED: 1, OPEN: 2, CLOSED: 3, CANCELLED: 4 },
    copies: ["src/app/admin/gamificacion/retos/page.tsx"],
  },
  {
    code: "T-2559",
    order: "RECONCILIATION_STATUSES",
    positions: { RUNNING: 0, DONE: 1, FAILED: 2 },
    canonical: reconciliationStatus.enumValues,
  },
  {
    code: "T-2681",
    order: "SUDOKU_DIFFICULTIES",
    positions: { EASY: 0, MEDIUM: 1, HARD: 2 },
    canonical: SUDOKU_DIFFICULTIES,
  },
  {
    code: "T-2804",
    order: "COMPETITION_STATUSES",
    positions: { DRAFT: 0, LIVE: 1, FINISHED: 2, ARCHIVED: 3 },
    canonical: COMPETITION_STATUSES,
  },
  {
    code: "T-2805",
    order: "AREAS",
    positions: {
      resumen: 0,
      equipos: 1,
      bases: 2,
      personal: 3,
      rotaciones: 4,
      resultados: 5,
      posiciones: 6,
      extras: 7,
      anuncios: 8,
      apuestas: 9,
      poderes: 10,
      seguimiento: 11,
    },
    copies: ["src/app/admin/the-games/[id]/page.tsx"],
  },
  {
    code: "T-2834",
    order: "ROUND_STATUSES",
    positions: { PENDING: 0, ACTIVE: 1, CLOSED: 2 },
    copies: ["src/app/admin/the-games/[id]/_ui/Play.tsx"],
  },
  {
    code: "T-2841",
    order: "SCHEDULE_ISSUE_KINDS",
    positions: {
      SELF_MATCH: 0,
      TEAM_TWICE_IN_ROTATION: 1,
      BASE_TWICE_IN_ROTATION: 2,
      BASE_OF_OTHER_DAY: 3,
      UNKNOWN_TEAM: 4,
      WITHDRAWN_TEAM: 5,
      REPEATED_PAIR: 6,
      BASE_REPEATED_IN_DAY: 7,
      TEAM_IDLE: 8,
    },
    canonical: SCHEDULE_ISSUE_KINDS,
  },
  {
    code: "T-2851",
    order: "STANDING_SCOPES",
    positions: { overall: 0, day1: 1, day2: 2 },
    copies: ["src/app/admin/the-games/[id]/_ui/Play.tsx"],
  },
  {
    code: "T-2860",
    order: "ANNOUNCEMENT_LEVELS",
    positions: { INFO: 0, WARNING: 1, URGENT: 2 },
    copies: ["src/app/admin/the-games/[id]/_ui/Community.tsx"],
  },
  {
    code: "T-2867",
    order: "BET_STATES",
    positions: { DRAFT: 0, OPEN: 1, CLOSED: 2, RESOLVED: 3, CANCELLED: 4 },
    canonical: MARKET_STATUSES,
  },
  {
    code: "T-2895",
    order: "LEVEL_ORDER",
    positions: { EXCELLENT: 0, GOOD: 1, FAIR: 2, TO_IMPROVE: 3 },
    copies: ["src/app/admin/the-games/[id]/_ui/Play.tsx"],
  },
  {
    code: "T-3040",
    order: "POWER_TYPES",
    positions: {
      RESULT_SWAP: 0,
      DOUBLE_POINTS: 1,
      CANCEL_POWER: 2,
      LATE_START: 3,
      ONE_PLAYER_DOWN: 4,
    },
    canonical: POWER_TYPES,
    label: LABELS.power,
  },
  {
    code: "T-3046",
    order: "GRANT_STATES",
    positions: { ASSIGNED: 0, DELIVERED: 1, USED: 2, EXPIRED: 3, VOIDED: 4 },
    copies: ["src/app/admin/the-games/[id]/_ui/Powers.tsx"],
  },
  {
    code: "T-3047",
    order: "POWER_EFFECTS",
    positions: { APPLIED: 0, CANCELLED: 1, NO_EFFECT: 2, NEUTRALIZED: 3 },
    canonical: POWER_EFFECTS,
  },
  {
    code: "T-3155",
    order: "STAFF_SHEET_ROLES",
    positions: { LEADER: 0, GRADER: 1, OVERSEER: 2, VAR: 3 },
    canonical: STAFF_SHEET_ROLES,
  },
  {
    code: "T-3225",
    order: "QUOTA_REASONS",
    positions: { BURST: 0, DAILY: 1, MONTHLY: 2 },
    label: LABELS.quotaReason,
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-3226",
    order: "QUOTA_PROVIDERS",
    positions: { console: 0, resend: 1, ses: 2 },
    label: LABELS.quotaProvider,
    copies: ["src/modules/comms/admin.ts"],
  },
  {
    code: "T-3266",
    order: "PARTICIPATION_STATUSES",
    positions: { PENDING: 0, COMPLETED: 1, REJECTED: 2, ANNULLED: 3 },
    canonical: challengeParticipationStatus.enumValues,
  },
  {
    code: "T-3267",
    order: "REWARD_STATUSES",
    positions: { RESERVED: 0, GRANTED: 1, RELEASED: 2, REVERSED: 3 },
    canonical: rewardStatus.enumValues,
  },
];

/** Recorridos por índice que las expresiones de la spec no ven: el orden está escrito en el sitio,
 * llega por parámetro o el recorrido no llama `index` a su índice. */
export const UNSEEN_PAIRS: readonly LabelPair[] = [
  {
    code: "T-454",
    order: "TIMELINE_FILTERS",
    positions: {
      ALL: 0,
      NOTE: 1,
      MEMBERSHIP: 2,
      COMMITTEES: 3,
      CONSENT: 4,
      DATA: 5,
      IMPORTED: 6,
      OTHER: 7,
      PARTICIPATION: 8,
      FORM: 9,
      PIPELINE: 10,
      REQUEST: 11,
      CALL: 12,
    },
    canonical: TIMELINE_FILTERS,
  },
  {
    code: "T-482",
    order: "IMPORT_GROUPS",
    positions: { NEW: 0, CHANGED: 1, UNCHANGED: 2, ERROR: 3 },
    copies: ["src/app/admin/sistema/importaciones/page.tsx"],
  },
  // El área de un comité (DT-370): `areaLabel` buscaba la clave en `COMMITTEE_AREAS`, un arreglo de
  // objetos, con `findIndex`, y ninguna expresión de la spec lo veía. Ahora lee por valor con la
  // tupla de las claves, que `people` declara junto a ese arreglo y en su mismo orden.
  {
    code: "T-2174",
    order: "COMMITTEE_AREA_KEYS",
    positions: { personas: 0, actividades: 1, comunicacion: 2, aliados: 3, finanzas: 4 },
    canonical: COMMITTEE_AREA_KEYS,
    label: LABELS.area,
  },
  {
    code: "T-567",
    order: "APPROVAL_MODES",
    positions: { AUTO: 0, MANUAL: 1 },
    canonical: occasionApproval.enumValues,
  },
  {
    code: "T-585",
    order: "COUNTER_ORDER",
    positions: { APPROVED: 0, PENDING: 1, REJECTED: 2, CANCELLED: 3 },
    copies: ["src/modules/participation/components/ConsolaEnVivo.tsx"],
  },
  {
    code: "T-639",
    order: "FILTERS",
    positions: { todos: 0, cumplen: 1, "no-cumplen": 2, ajustados: 3 },
    copies: ["src/app/admin/asambleas/page.tsx"],
  },
  {
    code: "T-721",
    order: "NEW_MEMBERS_FILTERS",
    positions: { ANY: 0, ONLY: 1, EXCLUDE: 2 },
    canonical: NEW_MEMBERS_FILTERS,
  },
  {
    code: "T-722",
    order: "COMMITTEE_FILTERS",
    positions: { ANY: 0, OWN: 1 },
    canonical: COMMITTEE_FILTERS,
  },
  {
    code: "T-724",
    order: "GROUP_MODES",
    positions: { FIXED: 0, PER_GROUP: 1, TIERS: 2 },
    canonical: GROUP_MODES,
  },
  {
    code: "T-789",
    order: "COMPLIANCE_FILTERS",
    positions: { todos: 0, "por-debajo": 1, "no-alcanza": 2, prueba: 3, nuevos: 4, exentos: 5 },
    canonical: COMPLIANCE_FILTERS,
  },
  {
    code: "T-816",
    order: "CLOSING_FILTERS",
    positions: { ALL: 0, UNDECIDED: 1, CHANGED: 2, EXITS: 3 },
    canonical: CLOSING_FILTERS,
  },
  {
    code: "T-999",
    order: "REQUEST_STATUSES_AND_ALL",
    positions: { PENDING: 0, APPROVED: 1, REJECTED: 2, WITHDRAWN: 3, ALL: 4 },
    canonical: [...REQUEST_STATUSES, "ALL"],
  },
  {
    code: "T-1057",
    order: "REQUEST_KINDS",
    positions: { LEAVE: 0, RESIGNATION: 1, TRANSFER: 2, EXCUSE: 3 },
    canonical: REQUEST_KINDS,
  },
  {
    code: "T-2375",
    order: "MACROEVENT_TABS",
    positions: { mesa: 0, equipo: 1, gap: 2, ediciones: 3 },
    copies: ["src/app/admin/macroeventos/[slug]/page.tsx"],
  },
  {
    code: "T-2402",
    order: "HREFS",
    positions: {
      "/app/gh-points": 0,
      "/app/gh-points/retos": 1,
      "/app/gh-points/boosters": 2,
      "/app/gh-points/coleccion": 3,
    },
    copies: ["src/app/app/gh-points/_ui/PointsNav.tsx"],
  },
  {
    code: "T-2448",
    order: "FILTROS",
    positions: { abiertos: 0, mios: 1, cerrados: 2 },
    copies: ["src/app/app/gh-points/retos/page.tsx"],
  },
  {
    code: "T-2639",
    order: "DIRECTIONS",
    positions: { U: 0, D: 1, L: 2, R: 3 },
    copies: ["src/modules/participation/components/Game2048.tsx"],
  },
  {
    code: "T-2808",
    order: "COMPETITION_STATUSES",
    positions: { DRAFT: 0, LIVE: 1, FINISHED: 2, ARCHIVED: 3 },
    canonical: COMPETITION_STATUSES,
  },
];

export type UnevenPair = {
  code: ListCode;
  order: string;
  /** El archivo que escribe el orden y lee la lista. */
  file: string;
  /** El orden, como está escrito en el archivo. */
  tuple: readonly string[];
  /** Cuántas piezas trae hoy la lista. */
  pieces: number;
  /** La posición que lee hoy cada valor que se lee por su posición en el orden. */
  positions: Record<string, number>;
  /** Cómo empieza la lectura en el archivo, sin espacios. */
  read: string;
  /** Si lo ve alguna de las expresiones de la spec. */
  seen: boolean;
};

/** Los pares que no son uno a uno: la lista y el orden tienen distinto largo. Quedan fuera de
 * `tLabels` (spec #242, «Implementation Decisions»): ninguno se recorta ni se alarga. */
export const UNEVEN_PAIRS: readonly UnevenPair[] = [
  // La consola no nombra EXCUSED: una asistencia excusada cae al respaldo y muestra el código. Desde
  // el ticket #317 sus cuatro estados leen por valor el `Record` del par uno a uno (DT-364).
  {
    code: "T-597",
    order: "CONSOLE_STATUSES",
    file: "src/modules/participation/admin.ts",
    tuple: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    pieces: 5,
    positions: { PENDING: 0, APPROVED: 1, REJECTED: 2, CANCELLED: 3 },
    read: "CONSOLE_STATUSES.map((status) => [status, statuses[status]])",
    seen: true,
  },
];

/** El par de largo distinto que armaba la pestaña de permanencia de la Persona 360: los seis motivos
 * automáticos del cierre (T-801) con las cuatro decisiones. Tres decisiones leían su posición y
 * `EXIT_OE` la 3 o la 4 según la asamblea obligatoria. No era la etiqueta de un valor: era una copia
 * de la regla con la que el cierre propone, y a la sexta pieza no llegaba (DT-388). La pestaña ya no
 * arma el subíndice: lee el número que el dominio le da con cada decisión, como la página del cierre
 * (ADR-128 regla 1), y esa lectura es de las de «un número que calcula el dominio» (ADR-126 regla
 * 13). Acá queda la posición que leía cada propuesta que se leía por su posición, que es el motivo
 * que hoy le da el dominio (lo fija tests/unit/permanence-pure.test.ts), y lo que la pestaña ya no
 * escribe. */
export const DOMAIN_REASONS: {
  code: ListCode;
  order: string;
  file: string;
  /** Cuántas piezas trae hoy la lista. */
  pieces: number;
  /** La posición que leía cada decisión que se leía por su posición en el orden. */
  positions: Record<string, number>;
  /** Cómo lee hoy el archivo, y lo que ya no escribe. */
  read: string;
  gone: readonly string[];
  /** Si lo veía alguna de las expresiones de la spec. */
  seen: boolean;
} = {
  code: "T-801",
  order: "DECISIONS",
  file: "src/app/admin/personas/[id]/_ui/TabPermanencia.tsx",
  pieces: 6,
  positions: { CONTINUES: 0, PROBATION: 1, EXIT_COMMITTEE: 2 },
  read: "reasonLabels[decision.proposalReason]",
  gone: ["DECISIONS.indexOf", "mandatory.met"],
  seen: true,
};

/** Los pares de largo distinto que la migración deshizo (ADR-126 reglas 2 y 9): sus valores son
 * parte de los de un par uno a uno de la misma lista y leen en él la misma pieza. La página del
 * cierre leía los tres estados finales con `3 + FINAL_STATES.indexOf` de subíndice: las tres
 * últimas piezas de los seis estados de cumplimiento. Ahora lee T-791 por valor con la tupla de los
 * seis (ticket #319). El formulario de reglas recorría por índice las siete categorías que admite
 * una regla, las ocho de una ocasión menos `INDUCTION`: ahora lee T-566 por valor con la tupla de
 * las ocho (revisión de la rama). Acá queda la posición literal que leía cada valor, para que siga
 * leyendo esa. */
export const UNDONE_UNEVEN_PAIRS: readonly {
  code: ListCode;
  order: string;
  file: string;
  /** El orden con el que el archivo lee hoy la lista por valor, y su tupla. */
  by: string;
  canonical: readonly string[];
  /** La posición que leía cada valor con el desplazamiento. */
  positions: Record<string, number>;
  /** Cómo lee hoy el archivo, y lo que ya no escribe. */
  read: string;
  gone: readonly string[];
  /** Si lo veía alguna de las expresiones de la spec. */
  seen: boolean;
}[] = [
  {
    code: "T-791",
    order: "FINAL_STATES",
    file: "src/app/admin/permanencia/cierre/page.tsx",
    by: "COMPLIANCE_STATES",
    canonical: COMPLIANCE_STATES,
    positions: { CUMPLE: 3, PRUEBA: 4, NO_CUMPLE: 5 },
    read: "stateLabels[committee.finalState]",
    gone: ["FINAL_STATES", ".indexOf(committee.finalState)"],
    seen: true,
  },
  {
    code: "T-566",
    order: "CATEGORIES",
    file: "src/app/admin/permanencia/_ui/reglas.ts",
    by: "OCCASION_CATEGORIES",
    canonical: OCCASION_CATEGORIES,
    positions: {
      INTEGRATION: 0,
      ATHLETIC_MATCH: 1,
      COMMITTEE_MEETING: 2,
      TALK: 3,
      WORKSHOP: 4,
      SOCIAL: 5,
      OTHER: 6,
    },
    read: 'categories: labeled(CATEGORIES, tLabels("T-566", OCCASION_CATEGORIES))',
    gone: ["function options(", "labels[index]"],
    seen: false,
  },
];

/** El par de largo distinto que armaba el `zip` de crm/jobs.ts (T-427 con `FIELD_KEYS`, ADR-126
 * reglas 2 y 6). T-427 trae once piezas, porque también da las columnas de Personas, y los campos de
 * un evento de persona son ocho: no hay par uno a uno con el que leerlo por valor. Desde la revisión
 * de la rama cada campo lee su posición escrita, que la tupla de `tList` cuida, y el `zip` ya no
 * existe. Acá queda la posición literal que leía cada campo, para que siga leyendo esa. */
export const UNZIPPED_FIELDS = {
  code: "T-427",
  order: "FIELD_KEYS",
  file: "src/modules/crm/jobs.ts",
  pieces: 11,
  positions: {
    firstName: 0,
    lastName: 1,
    email: 2,
    preferredName: 3,
    phone: 4,
    personalEmail: 5,
    program: 6,
    kind: 7,
  } as Record<string, number>,
  /** Lo que el archivo ya no escribe. */
  gone: ["function zip(", "FIELD_KEYS"],
} satisfies { code: ListCode; [key: string]: unknown };

/** Los diez pares que `labels()` de crm/jobs.ts armaba con su `zip`: la clave de las etiquetas de
 * la línea de tiempo, el orden que usaba y si ese orden es uno de los cuatro que el archivo declara.
 * Desde el ticket #318 nueve se leen por valor con `tLabels`; `fields`, el de largo distinto, lee
 * posiciones escritas desde la revisión de la rama (`UNZIPPED_FIELDS`). Qué etiqueta le toca a cada
 * valor lo fija, pasando por `labels()`, tests/integration/crm-timeline-labels.test.ts. */
export const ZIP_PAIRS: readonly { key: string; order: string; code: ListCode; own: boolean }[] = [
  { key: "sanctionKinds", order: "SANCTION_KINDS", code: "T-2229", own: false },
  { key: "stages", order: "STAGE_CODES", code: "T-1047", own: true },
  { key: "requestStatuses", order: "REQUEST_STATUSES", code: "T-876", own: false },
  { key: "callEntryStatuses", order: "CALL_ENTRY_STATUSES", code: "T-899", own: false },
  { key: "decisions", order: "DECISION_KINDS", code: "T-802", own: true },
  { key: "statuses", order: "STATUS_CODES", code: "T-381", own: true },
  { key: "appointmentKinds", order: "APPOINTMENT_KINDS", code: "T-444", own: false },
  { key: "permissions", order: "PERMISSION_CODES", code: "T-289", own: true },
  { key: "purposes", order: "CONSENT_PURPOSES", code: "T-516", own: false },
  { key: "fields", order: "FIELD_KEYS", code: "T-427", own: false },
];

const DESGLOSE = "src/modules/permanence/components/Desglose.tsx";

/** Los cinco sitios que escribían el orden en el subíndice de la lectura (`lista[["A", "B"].indexOf(`)
 * y que el ticket #318 pasó a leer por valor con una constante con nombre. Con el orden en el
 * subíndice la prueba fijaba también qué lista leía el archivo con él; con la constante ese caso ya
 * no aplica, y `tLabels` solo compara largos: otra lista del mismo largo compila. Ninguna prueba lee
 * el texto de estos cinco, así que acá queda, leído del código, qué lista lee cada archivo con ese
 * orden y si el orden es una constante suya (`own`) o una tupla exportada. El ticket #319 suma los
 * sitios del admin de The Games, de permanencia y de comités que dejan el subíndice de la misma
 * forma, y la página del cierre, que deja de leer los estados finales con un desplazamiento. El
 * ticket #320 suma los dos sitios que quedaban con el orden en el subíndice (`Team.tsx` del
 * macroevento y la ruta de búsqueda), las dos páginas de retos que guardaban el índice en una
 * función y nueve archivos que leen su lista con un orden propio, que antes recorrían por índice. */
export const NAMED_READS: readonly { file: string; order: string; code: ListCode; own: boolean }[] =
  [
    { file: DESGLOSE, order: "ASSEMBLY_KINDS", code: "T-546", own: false },
    { file: DESGLOSE, order: "MEMBER_STATUSES", code: "T-381", own: true },
    {
      file: "src/modules/permanence/components/TablaReglas.tsx",
      order: "APPLIES_TO",
      code: "T-717",
      own: false,
    },
    {
      file: "src/modules/permanence/components/TeamParticipations.tsx",
      order: "EVALUATIONS",
      code: "T-750",
      own: true,
    },
    {
      file: "src/modules/people/domain/sanctions.ts",
      order: "SANCTION_STATES",
      code: "T-2243",
      own: true,
    },
    {
      file: "src/app/admin/the-games/[id]/page.tsx",
      order: "COMPETITION_STATUSES",
      code: "T-2804",
      own: false,
    },
    {
      file: "src/app/admin/the-games/[id]/_ui/Play.tsx",
      order: "ROTATION_STATUSES",
      code: "T-2834",
      own: true,
    },
    {
      file: "src/app/admin/the-games/[id]/_ui/Community.tsx",
      order: "ANNOUNCEMENT_LEVELS",
      code: "T-2860",
      own: true,
    },
    {
      file: "src/app/admin/the-games/[id]/_ui/Community.tsx",
      order: "MARKET_STATUSES",
      code: "T-2867",
      own: false,
    },
    {
      file: "src/app/admin/comites/[slug]/permanencia/page.tsx",
      order: "CONDITIONS",
      code: "T-792",
      own: true,
    },
    {
      file: "src/app/admin/comites/[slug]/permanencia/page.tsx",
      order: "COMPLIANCE_STATES",
      code: "T-791",
      own: false,
    },
    {
      file: "src/app/admin/permanencia/cierre/page.tsx",
      order: "COMPLIANCE_STATES",
      code: "T-791",
      own: false,
    },
    {
      file: "src/app/admin/permanencia/evaluaciones/page.tsx",
      order: "EVALUATIONS",
      code: "T-750",
      own: true,
    },
    {
      file: "src/app/admin/permanencia/grupos/[id]/page.tsx",
      order: "EVALUATIONS",
      code: "T-750",
      own: true,
    },
    {
      file: "src/modules/participation/components/Game2048.tsx",
      order: "DIRECTIONS",
      code: "T-2639",
      own: true,
    },
    // Las categorías del formulario de reglas: un par de largo distinto que la migración deshizo.
    {
      file: "src/app/admin/permanencia/_ui/reglas.ts",
      order: "OCCASION_CATEGORIES",
      code: "T-566",
      own: false,
    },
    // Los contadores de la consola en vivo: recibían la lista por props y la recorrían por índice.
    {
      file: "src/modules/participation/components/ConsolaEnVivo.tsx",
      order: "COUNTER_ORDER",
      code: "T-585",
      own: true,
    },
    {
      file: "src/app/admin/sistema/importaciones/page.tsx",
      order: "IMPORT_GROUPS",
      code: "T-482",
      own: true,
    },
    {
      file: "src/app/app/gh-points/retos/page.tsx",
      order: "FILTROS",
      code: "T-2448",
      own: true,
    },
    {
      file: "src/app/app/gh-points/_ui/PointsNav.tsx",
      order: "HREFS",
      code: "T-2402",
      own: true,
    },
    {
      file: "src/app/admin/macroeventos/[slug]/page.tsx",
      order: "MACROEVENT_TABS",
      code: "T-2375",
      own: true,
    },
    {
      file: "src/app/admin/macroeventos/[slug]/_ui/Team.tsx",
      order: "EVALUATIONS",
      code: "T-750",
      own: true,
    },
    {
      file: "src/app/app/ajustes/page.tsx",
      order: "SECCIONES",
      code: "T-133",
      own: true,
    },
    {
      file: "src/app/app/_ui/PersonaTarjeta.tsx",
      order: "STATUS_CODES",
      code: "T-381",
      own: true,
    },
    {
      file: "src/app/api/admin/buscar/route.ts",
      order: "ORGANIZATION_KINDS",
      code: "T-949",
      own: false,
    },
    {
      file: "src/app/admin/asambleas/page.tsx",
      order: "FILTERS",
      code: "T-639",
      own: true,
    },
    {
      file: "src/app/admin/gamificacion/revision/page.tsx",
      order: "MEMBER_STATES",
      code: "T-2410",
      own: true,
    },
    {
      file: "src/app/admin/gamificacion/retos/[id]/page.tsx",
      order: "MEMBER_STATES",
      code: "T-2410",
      own: true,
    },
    {
      file: "src/app/admin/gamificacion/retos/page.tsx",
      order: "STATES",
      code: "T-2511",
      own: true,
    },
  ];

export type IndexPair = {
  code: ListCode;
  /** La constante que guarda, escrita a mano, la posición de cada valor. */
  order: string;
  /** El archivo que declara la constante y lee la lista con ella. */
  file: string;
  /** La posición que la constante le da a cada valor, como está escrita en el archivo. */
  positions: Record<string, number>;
  /** Cuántas piezas trae hoy la lista. */
  pieces: number;
  /** De dónde sale la lista, cuando la lectura pasa por una variable. */
  list?: string;
  /** Cada lectura del archivo, como está escrita. */
  reads: readonly string[];
  /** Si las posiciones son de tipo literal (`as const`): ahí la tupla de `tList` cuida el largo.
   * Con `Record<…, number>` no lo cuida nadie. */
  literal: boolean;
};

const CHALLENGE_CARD = "src/modules/participation/components/ChallengeCard.tsx";

/** Las constantes que guardan la posición de cada valor (`lista[KIND_INDEX[valor]] ?? valor`). No
 * llevan `indexOf`, así que no las ve ninguna expresión de la spec #242 ni las cuenta entre sus
 * sitios: ningún ticket de la migración las toca (ADR-126 regla 1, DT-366). */
export const INDEX_PAIRS: readonly IndexPair[] = [
  {
    code: "T-2409",
    order: "KIND_INDEX",
    file: CHALLENGE_CARD,
    positions: { PRESENTIAL: 0, TRIVIA: 1, EVIDENCE: 2 },
    pieces: 3,
    list: 'const kinds = tList("T-2409");',
    reads: ["kinds[KIND_INDEX[card.kind]] ?? card.kind"],
    literal: false,
  },
  {
    code: "T-2411",
    order: "AUDIENCE_INDEX",
    file: CHALLENGE_CARD,
    positions: { ALL: 0, NEW: 1, VETERAN: 2, COMMITTEES: 3 },
    pieces: 4,
    list: 'const audiences = tList("T-2411");',
    reads: ["audiences[AUDIENCE_INDEX[card.audience]] ?? card.audience"],
    literal: false,
  },
  {
    code: "T-2511",
    order: "STATE_INDEX",
    file: CHALLENGE_CARD,
    positions: { DRAFT: 0, SCHEDULED: 1, OPEN: 2, CLOSED: 3, CANCELLED: 4 },
    pieces: 5,
    list: 'const states = tList("T-2511");',
    reads: ["states[STATE_INDEX[card.state]] ?? card.state"],
    literal: false,
  },
  {
    code: "T-2410",
    order: "STATUS_INDEX",
    file: CHALLENGE_CARD,
    positions: { AVAILABLE: 0, SENT: 1, PENDING: 2, COMPLETED: 3, REJECTED: 4, EXPIRED: 5 },
    pieces: 6,
    list: 'const memberStates = tList("T-2410");',
    reads: ["memberStates[STATUS_INDEX[card.status]] ?? card.status"],
    literal: false,
  },
  {
    code: "T-2451",
    order: "BOOSTER_INDEX",
    file: CHALLENGE_CARD,
    positions: { PLUS_50: 0, PLUS_100: 1 },
    pieces: 2,
    reads: ['tList("T-2451")[BOOSTER_INDEX[card.boosterKind]] ?? card.boosterKind'],
    literal: false,
  },
  // Cuatro familias para cinco piezas: la quinta, las ediciones especiales, la lee `familyNames[4]`.
  {
    code: "T-2473",
    order: "FAMILY_INDEX",
    file: "src/app/app/gh-points/coleccion/page.tsx",
    positions: { EN_PARCHE: 0, EXPLORADOR: 1, RELAMPAGO: 2, PALABRA_A_PALABRA: 3 },
    pieces: 5,
    list: 'const familyNames = tList("T-2473");',
    reads: [
      "{familyNames[FAMILY_INDEX[family.family]]}",
      "nombre={familyNames[FAMILY_INDEX[family.family]] ?? family.family}",
    ],
    literal: false,
  },
  // T-493 no tiene otro par: el único orden de los estados de una importación es esta constante.
  {
    code: "T-493",
    order: "STATUS_INDEX",
    file: "src/app/admin/sistema/importaciones/page.tsx",
    positions: { PREVIEW: 0, APPLIED: 1, DISCARDED: 2, FAILED: 3 },
    pieces: 4,
    list: 'const estados = tList("T-493");',
    reads: ["estados[STATUS_INDEX[job.status]] ?? job.status"],
    literal: false,
  },
  // Los cuatro estados de una campaña leen las piezas 1 a 4 de los estados de un RETO: `ACTIVE`
  // lee la de `OPEN` y `ENDED` la de `CLOSED`.
  {
    code: "T-2511",
    order: "STATE_INDEX",
    file: "src/app/admin/gamificacion/campanas/page.tsx",
    positions: { SCHEDULED: 1, ACTIVE: 2, ENDED: 3, CANCELLED: 4 },
    pieces: 5,
    list: 'const stateLabels = tList("T-2511");',
    reads: ["stateLabels[STATE_INDEX[campaign.state]] ?? campaign.state"],
    literal: true,
  },
  {
    code: "T-2409",
    order: "KIND_INDEX",
    file: "src/app/app/gh-points/retos/[id]/page.tsx",
    positions: { PRESENTIAL: 0, TRIVIA: 1, EVIDENCE: 2 },
    pieces: 3,
    reads: ['tList("T-2409")[KIND_INDEX[challenge.kind]] ?? challenge.kind'],
    literal: true,
  },
  // T-3207 tampoco tiene otro par, y su lectura no tiene respaldo.
  {
    code: "T-3207",
    order: "MOTIVES",
    file: "src/shared/lib/image-decoder.ts",
    positions: { unreadable: 0, format: 1, pixels: 2, encode: 3, memory: 4 },
    pieces: 5,
    reads: ['super(tList("T-3207")[MOTIVES[reason]], options)'],
    literal: true,
  },
];

/** Lo que tiene la forma de esas lecturas y no es la etiqueta de un valor. */
export const INDEXED_BUT_NOT_LABELS: readonly { file: string; order: string; why: string }[] = [
  {
    file: "src/modules/participation/domain/ledger.ts",
    order: "GAME_RUN_COLUMN",
    why: "elige la columna de `point_entry` que guarda la partida de cada juego",
  },
];
