import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type ModuleInterface,
  type ModuleInterfaces,
  moduleInterfaces,
} from "../../scripts/lib/module-interface-metrics";

// El `index.ts` de un módulo es su interfaz pública (ADR-080 regla 1) y exporta más de lo que se usa
// afuera (DT-012, spec #238). knip no lo avisa: toma cada `index.ts` como entrada y no mira los
// exports de una entrada. Por eso esta prueba lee el código: por cada módulo de `src/modules` saca
// los nombres que su `index.ts` exporta y que nadie de producción importa por nombre, y los compara
// con `EXCEPTIONS`. Un nombre nuevo sin consumidor la pone en rojo, y una excepción que sobra también
// (ADR-125 regla 1).
//
// Se queda en un `index.ts`, sin pasar por la lista, lo que importa por nombre un archivo de `src`,
// `scripts` o `.railway` de fuera del módulo, o un componente del propio módulo, que no puede
// importar `domain/` (regla `componentes-sin-servidor`). Los tipos siguen el mismo criterio. Lo que
// importa una prueba no cuenta como uso: decide la clase.
//
// Cada excepción tiene su clase, y la clase dice qué espera:
//
// - `nadie`: no lo importa nadie de afuera, ni las pruebas. Es lo que poda el ciclo 13, módulo por
//   módulo (tickets 2 a 6 de la spec): sale del `index.ts` y de acá en el mismo commit.
//   El módulo que se queda sin ninguno sale también, en ese commit, de `entry` en `knip.ts`: desde
//   ahí knip analiza sus exports (ADR-125 regla 3).
// - `solo-pruebas`: lo importa algún archivo de `tests/` y nadie más de afuera. Se queda en el
//   `index.ts` hasta la decisión abierta 73, que dice por dónde entran las pruebas a esos nombres.
// - `competition`: es de `competition` y no lo importa nadie de afuera. El módulo está quieto hasta
//   la decisión abierta 8 (DT-044) y no se poda.
//
// La clase no se elige: sale del código. Si una prueba empieza a importar un nombre de `nadie`, pasa
// a `solo-pruebas`, y la prueba lo pide. La lista va por módulo, con un nombre por renglón y en el
// orden de `sort()` (mayúsculas primero), para que podar sea borrar renglones.
//
// Antes de sumar un nombre acá: lo que nadie de afuera usa no se exporta, se importa de `domain/`
// dentro del módulo. La lista es para lo que ya estaba y para lo que espera una decisión.

type ExceptionClass = "nadie" | "solo-pruebas" | "competition";

const CLASSES: ExceptionClass[] = ["nadie", "solo-pruebas", "competition"];
/** El módulo que no se poda mientras la decisión abierta 8 no diga otra cosa. */
const QUIET_MODULE = "competition";

type Exceptions = Record<string, Partial<Record<ExceptionClass, string>>>;

const EXCEPTIONS: Exceptions = {
  comms: {
    nadie: `
      AudienceEstimate
      CAMPAIGN_STATUSES
      CampaignBacklog
      CampaignInput
      CampaignListRow
      CampaignQuotaStatus
      CampaignStatus
      DeliveryStats
      MessageChannel
      MessageKind
      MessageStatus
      NOTIFICATION_KINDS
      NotificationKind
      NotificationRequested
      PreferenceFlags
      PreferencesInput
      QuotaScope
      RecipientView
      RenderedEmail
      SendReceipt
      SubscriptionInput
      SubscriptionView
      TEMPLATE_VARIABLES
      TemplateInput
      TemplateRow
      TemplateValues
      TransactionalEmail
      campaignEligibility
      campaignInputSchema
      chooseRoute
      deleteMessagesFor
      hasPendingRecipients
      listCampaignOptions
      listCampaigns
      listPreferencesFor
      listTemplateOptions
      listTemplates
      markdownToMailHtml
      markdownToPlain
      notificationRequestedSchema
      preferencesInputSchema
      recordMessage
      renderEmail
      renderTemplate
      shouldDeliver
      templateInputSchema
      updateTemplate
    `,
    "solo-pruebas": `
      DEFAULT_PREFERENCES
      createCampaignAs
      deliverNotification
      processCampaignBatch
      runCampaignTick
      setMailTransportsForTests
      setPushSenderForTests
      splitPush
      startDueCampaigns
      updateCampaignAs
    `,
  },
  competition: {
    competition: `
      BASE_KINDS
      BaseKind
      COMPETITION_STATUSES
      CompetitionStatus
      Day
      DelayRow
      EnterHubResult
      ExtraRubricTeam
      HubState
      HubTeam
      ImportDayResult
      ImportPowersResult
      JudgeNudge
      JudgeStage
      JuryTeamResult
      MARKET_STATUSES
      MarketStatus
      OUTCOMES
      POINTS
      PlaceBetResult
      PowerBoardTeam
      PowerBoardUse
      PowerDetail
      RecordedBy
      RotationMatchupsResult
      RouteStop
      RubricLevel
      SCHEDULE_ERROR_KINDS
      SHOWCASE_VERSION
      Showcase
      StaffPreviewBase
      StandingRow
      TEAM_CODE_LENGTH
      TEAM_NAME_FIELD
      TeamRoute
      listTeamBetReturns
      normalizeTeamCode
      pairCountKey
      pairCounts
      showcaseSchema
      teamRouteSchema
      updateTeamAs
    `,
    "solo-pruebas": `
      ImportStaffResult
      clearRouteMemo
      clearShowcaseMemo
      getHubTeam
      hubStateSchema
    `,
  },
  content: {
    nadie: `
      AnnouncementRow
      ArticleHit
      CommitteeAnnouncementInput
      DocumentKind
      MediaRedirect
      PageRow
      PublishedDocument
      PublishedDocumentDetail
      blocksText
      createPage
      documentContentChecksum
      getPage
      listAnnouncements
      listPages
      unpublishAnnouncement
      updateAnnouncement
      updatePage
    `,
    "solo-pruebas": `
      getAnnouncement
      publishAndPushAnnouncement
      requestAnnouncementPush
    `,
  },
  crm: {
    nadie: `
      AdminDashboard
      ApplyContext
      ApplyResult
      BoardColumn
      BoardSummary
      CallEntryStatus
      CallEntryView
      CallInput
      CallListRow
      CallSelection
      CallStatus
      CardInput
      CardUpdateInput
      CardView
      CommitteeChange
      ContactInput
      ContactView
      DASHBOARD_ROWS
      DecisionInput
      EXCUSE_BUSINESS_DAYS
      ExcuseCause
      ExcusePayload
      ExternalContactInput
      LeavePayload
      OnboardingEvidence
      OnboardingStep
      OrganizationInput
      OrganizationKind
      OrganizationListRow
      OrganizationRef
      PipelineKind
      PipelineListRow
      RecognitionInput
      RequestStatus
      ResignationPayload
      StageInput
      StageRecord
      StageTemplate
      TaskInput
      TransferPayload
      callInputSchema
      closedAtForStage
      contactInputSchema
      countCallsByGroup
      daysInStage
      excuseCauseLabel
      getOrganizationsByIds
      getPipelinesByIds
      hasRoom
      initialEntryStatus
      isCallOpen
      leavePayloadSchema
      listBoardSummaries
      listCalls
      organizationInputSchema
      requestStatusLabel
      resignationPayloadSchema
      resultingCommittees
      transferPayloadSchema
    `,
    "solo-pruebas": `
      countPendingRequests
      createOrganizationAs
      listOrganizationsOfPerson
      listStages
      updateOrganizationAs
    `,
  },
  forms: {
    nadie: `
      AnswerValue
      AnswersResult
      CreateSubmissionInput
      FIELD_KEY
      FORM_MAX_PER_IP
      FORM_SLUG
      FORM_WINDOW_MS
      FieldType
      FormActions
      FormInput
      FormListRow
      FormOpenState
      FormWindow
      PublicForm
      RESERVED_KEYS
      RegistrationRow
      SubmitInput
      SubmitResult
      actionsSchema
      fieldSchema
      fieldsSchema
      formInputSchema
      formOpenState
      getRegistration
      listForms
      listRegistrations
      parseActions
      personDataFromAnswers
      publicIdentitySchema
      setFormStatus
      updateForm
    `,
    "solo-pruebas": `
      createForm
      setFormActions
      setFormFields
    `,
  },
  identity: {
    nadie: `
      CARNET_TOKEN
    `,
    "solo-pruebas": `
      CarnetMetadata
      getOrCreateCarnetToken
      grantPermission
      requestOtp
      resolveActor
      revokePermission
      signInWithPassword
      signOut
      verifyOtp
    `,
  },
  participation: {
    nadie: `
      AbandonSudokuInput
      AdjustRequirementInput
      AdminParticipantRow
      AgendaEdition
      AgendaEntry
      AgendaOccasion
      AnswerSurveyResult
      ApprovedCheckIn
      AssemblyCompliance
      AssemblyKind
      AssemblyOverviewRow
      AssemblyRepresentation
      AssemblyRequirementView
      BadgeCollection
      BadgeDelta
      BadgeFact
      BadgeFamily
      Board
      BoostCampaignRow
      BoosterAdminRow
      BoosterOrigin
      BoosterRow
      BoosterStoredStatus
      BoosterTargetView
      CHALLENGE_AUDIENCES
      CampaignAdminRow
      CampaignAdminState
      CampaignInput
      CampaignPercent
      ChallengeAdminRow
      ChallengeAudience
      ChallengeInput
      ChallengeKind
      ChallengeParticipationExportRow
      ChallengeQuestionRow
      ChallengeRow
      ChallengeStoredStatus
      CheckInDecision
      CheckInExportRow
      CheckInOutcome
      CollectionLevel
      CommitteeOccasionScore
      CommitteeParticipationRow
      CommitteeScore
      CommitteeSurveys
      CommitteeViability
      CreatedInvite
      DueReminder
      EVIDENCE_KEY_PREFIX
      EvidenceFileRow
      EvidenceFileStatus
      EvidenceSubmitInput
      ExcuseInput
      FinishGame2048Input
      FinishSudokuInput
      GAME2048_MAX_MOVES
      GAME2048_REWARDS
      GAME2048_RULES_VERSION
      GAMIFICATION_TIMEZONE
      Game2048Denial
      Game2048Move
      Game2048RunView
      Game2048StartedView
      Game2048State
      Game2048Status
      GamificationOverview
      Level
      LiveCheckIn
      LiveSnapshot
      MAX_EXCUSED_ABSENCES
      MEMBER_CHALLENGE_STATUSES
      MemberCampaignView
      MyPosition
      OCCASION_KINDS
      OCCASION_STATUSES
      OccasionInput
      OccasionRef
      OccasionStatus
      OccasionSurveySummary
      PARTICIPATION_STATUSES
      PUBLIC_ID
      ParticipationRow
      ParticipationStatus
      PendingReviewRow
      PersonAgendaContext
      PersonAssemblyStatus
      PersonalPercent
      PointEntryRow
      PreparedEvidenceUpload
      QuestionSummary
      RECONCILE_BATCH
      Ranked
      RankedPerson
      ReconciliationReport
      ReconciliationRunRow
      ReminderHours
      ReminderOccasion
      ReminderSlot
      RemindersResult
      ReportSampleEntry
      RepresentationLadder
      ReserveRewardInput
      ReviewInput
      RewardBreakdown
      RewardCaps
      RewardRow
      RewardSource
      RewardStatus
      SelfCheckInDenial
      SeriesInput
      SpecialBadgeInput
      StandingCommittee
      StandingPerson
      StartGame2048Input
      StartSudokuInput
      SubmitDenial
      SubmitWordleInput
      SudokuDenial
      SudokuDifficulty
      SudokuPlay
      SudokuRunView
      SudokuStartedView
      SudokuStatus
      SurveyInviteState
      SurveySummary
      TermStandingView
      TodayGame2048
      TodaySudoku
      TodayWordle
      TriviaSubmitInput
      ViabilityAlert
      ViabilityInput
      WindowState
      WordleAttemptView
      WordleDenial
      WordleGameView
      WordleLetterState
      WordleReminderResult
      WordleResult
      WordleStatus
      applyGame2048Move
      assemblyCompliance
      audienceIncludes
      awardSpecialBadge
      awardSpecialBadgesForChallenge
      awardSpecialBadgesForOccasion
      badgeFactsFor
      badgeProgress
      balance
      boosterExpiresAt
      boosterPercent
      boosterState
      cancelCampaign
      challengeState
      competitionRanks
      computeReward
      countApproved
      countOpenOccasions
      countPendingGamification
      createCampaigns
      createSpecialBadge
      dayKeyFor
      deleteEvidenceFor
      findChallenge
      game2048Reward
      gradeTrivia
      grantBoosterForAchievement
      grantBoosterManually
      isGame2048Moves
      listParticipationsForExport
      markSeen
      memberChallengeStatus
      newGame2048
      processReconciliationBatch
      recomputeBadgesFor
      recomputeBadgesForAs
      reminderSlots
      replayGame2048
      representationLadder
      requiredTotal
      reserveAndGrantReward
      resolveOccasionContext
      resumeReconciliation
      revokeBooster
      setBoosterTarget
      setFeatured
      startReconciliation
      summarizeAnswers
      unlockedLevel
      updateOccasionAs
      usedRewardPoints
      verifyEvidenceObjects
      viabilityAlerts
      weekKeyFor
      weeklyDates
    `,
    "solo-pruebas": `
      CheckInSource
      checkInLink
      grantReward
      listCheckInsForExport
      releaseReward
      rereserveReward
      reserveReward
      reverseReward
      rotatingCodeAt
      runReminders
      runWordleReminder
      secondsUntilRotation
    `,
  },
  people: {
    nadie: `
      AlumniEntry
      AlumniYear
      AppointmentKind
      AppointmentView
      ChangeStatusInput
      CommitteeMembershipView
      CommitteeProfileInput
      ConsentPurpose
      ConsentState
      DirectedCommittee
      DirectionRef
      DirectoryEntry
      DirectoryPage
      EndMembershipInput
      ExpiredLeave
      FormPersonInput
      HONORARY_REQUIREMENTS
      HonoraryFacts
      LeaderProposal
      MIN_HONORARY_REQUIREMENTS
      MailingRef
      MemberByEmail
      MemberRef
      MemberSummary
      MembershipEventView
      MembershipRef
      MembershipStatusRef
      MissingRequiredRoles
      OwnContactInput
      PersonInput
      PersonRecord
      PersonRef
      PersonRow
      PersonalData
      PreferentialRow
      PublicCommittee
      REPRESENTATIVE_ROLES
      RemovalRequestInput
      RepresentativeInput
      RepresentativeRole
      RosterChangeInput
      RosterScope
      SanctionInput
      SanctionKind
      SanctionLike
      SanctionState
      SanctionStateView
      SegmentFilter
      SegmentRow
      TermAppointment
      TermCommitteeMember
      TermCommittees
      dayKeyOf
      expulsionWarning
      formPersonSchema
      getCommittee
      hasCapability
      listCommittees
      listPeople
      listPreferentialSchedule
      preferentialKindLabel
      representativeInputSchema
      representativeRoleLabel
      sanctionKindLabel
      segmentFilterSchema
      splitFullName
      updateCommittee
    `,
    "solo-pruebas": `
      SanctionScope
      createCommittee
      createPersonAs
    `,
  },
  permanence: {
    nadie: `
      APPLIES_TO
      AppliesTo
      BoardExportRow
      BoardIndicators
      COMPUTATIONS
      ClosingCommitteeRow
      ClosingSummary
      ClosingView
      CommitteeIndicators
      ComplianceRow
      Condition
      DecisionInput
      DecisionRow
      EditorContext
      EvaluationInput
      FinalState
      GROUP_MODES
      GroupDetail
      GroupInput
      GroupListRow
      ImpactPreview
      LeaderScoreInput
      LeaderScoreView
      ManualCreditInput
      ManualCreditView
      MyGroupRoles
      NoticePush
      NoticesResult
      PermanenceState
      PersonDecisionView
      PersonPermanenceView
      Proposal
      RetentionRow
      RuleInput
      SCOPES
      SnapshotView
      TeamParticipation
      TrayGroup
      distribution
      groupInputSchema
      isoWeek
      listDecisions
      noticePush
      noticesFor
      parseGeneral
      parseMandatory
      proposeDecisions
      snapshotToResult
      tableSums
      updateGroupAs
    `,
    "solo-pruebas": `
      applyDecisions
      computePerson
      countPendingFor
      createGroupAs
      freezeSnapshots
      getSnapshot
      listGroups
      loadPeopleFacts
      loadTermFacts
      parseResults
      recomputeSnapshots
      runNotices
    `,
  },
  system: {
    "solo-pruebas": `
      ConfigKey
      ConfigValue
      checkBackup
      setConfig
    `,
  },
  terms: {
    "solo-pruebas": `
      updateTerm
    `,
  },
};

const PRODUCTION_DIRS = ["src", "scripts", ".railway"];

function sources(dir: string) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(ts|tsx|mts|mjs)$/.test(name))
    .map((name) => ({ path: `${dir}/${name}`, text: readFileSync(`${dir}/${name}`, "utf8") }));
}

function namesOf(list: string | undefined): string[] {
  return (list ?? "").split(/\s+/).filter(Boolean);
}

/** La clase sale del código: quién importa el nombre y de qué módulo es. */
function classOf(found: ModuleInterface, name: string): ExceptionClass {
  if (found.testOnly.includes(name)) {
    return "solo-pruebas";
  }
  return found.module === QUIET_MODULE ? "competition" : "nadie";
}

/** Lo que separa a la lista del código, una frase por nombre; vacío cuando coinciden. */
function mismatches(modules: ModuleInterface[], exceptions: Exceptions): string[] {
  const problems: string[] = [];
  for (const found of modules) {
    const listed = new Map(
      CLASSES.flatMap((kind) =>
        namesOf(exceptions[found.module]?.[kind]).map((name) => [name, kind] as const),
      ),
    );
    for (const name of found.unused) {
      const kind = classOf(found, name);
      const written = listed.get(name);
      if (!written) {
        problems.push(
          `${found.module}: \`${name}\` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «${kind}»)`,
        );
      } else if (written !== kind) {
        problems.push(`${found.module}: \`${name}\` está como «${written}» y hoy es «${kind}»`);
      }
    }
    for (const [name, kind] of listed) {
      if (!found.unused.includes(name)) {
        const why = found.exported.includes(name)
          ? "ya lo importa producción de afuera o un componente del módulo"
          : "el `index.ts` ya no lo exporta";
        problems.push(`${found.module}: \`${name}\` sobra en «${kind}»: ${why}`);
      }
    }
  }
  const known = new Set(modules.map((found) => found.module));
  for (const module of Object.keys(exceptions)) {
    if (!known.has(module)) {
      problems.push(`${module}: está en la lista y no es un módulo de \`src/modules\``);
    }
  }
  return problems;
}

/**
 * Las entradas que `knip.ts` escribe en `entry`, leídas del texto. Recorre la lista pieza por pieza
 * (un texto entre comillas dobles, una coma, un comentario de renglón) hasta su `]`, y falla ante
 * cualquier otra cosa: lo que se arme de otro modo no se puede comparar con la lista.
 */
function knipEntries(text: string): string[] {
  const opening = /\bentry:\s*\[/.exec(text);
  if (!opening) {
    throw new Error("No se puede leer `entry` en knip.ts: no es una lista escrita ahí");
  }
  const piece = /\s+|,|\/\/[^\n]*|"([^"\n]*)"|(\])/y;
  const entries: string[] = [];
  let at = opening.index + opening[0].length;
  for (;;) {
    piece.lastIndex = at;
    const match = piece.exec(text);
    if (!match) {
      const unread = text.slice(at, at + 40).split("\n")[0];
      throw new Error(
        `No se puede leer \`entry\` en knip.ts: tiene algo que no es un texto (${unread})`,
      );
    }
    if (match[2]) {
      return entries;
    }
    if (match[1] !== undefined) {
      entries.push(match[1]);
    }
    at = piece.lastIndex;
  }
}

const MODULE_ENTRY = /^src\/modules\/([a-z0-9-]+)\/index\.ts$/;
/** Una entrada de knip que alcanza `src`: lo nombra o empieza por un comodín. */
const REACHES_SRC = /^(\.\/)?(src\b|[*{?[!])/;

/**
 * Lo que separa a `entry` de `knip.ts` de la lista, una frase por caso; vacío cuando coinciden.
 * knip no analiza los exports de una entrada, así que el `index.ts` de un módulo es entrada solo
 * mientras le quede algo en `nadie` o en `competition` (ADR-125 regla 3).
 */
function entryMismatches(entry: string[], modules: string[], exceptions: Exceptions): string[] {
  const problems: string[] = [];
  const named: string[] = [];
  for (const pattern of entry) {
    const module = MODULE_ENTRY.exec(pattern)?.[1];
    if (module && named.includes(module)) {
      problems.push(`${module}: su \`index.ts\` está dos veces en \`entry\` de knip`);
    } else if (module) {
      named.push(module);
    } else if (REACHES_SRC.test(pattern)) {
      problems.push(
        `\`${pattern}\`: una entrada de knip que alcanza \`src\` nombra el \`index.ts\` de un módulo, no un patrón ni otro archivo`,
      );
    }
  }
  for (const module of modules) {
    const pending = (["nadie", "competition"] as const).some(
      (kind) => namesOf(exceptions[module]?.[kind]).length > 0,
    );
    if (pending && !named.includes(module)) {
      problems.push(
        `${module}: le queda algo por podar y su \`index.ts\` no está en \`entry\` de knip`,
      );
    } else if (!pending && named.includes(module)) {
      problems.push(
        `${module}: no le queda nada por podar y su \`index.ts\` sigue en \`entry\` de knip, que así no analiza sus exports`,
      );
    }
  }
  for (const module of named) {
    if (!modules.includes(module)) {
      problems.push(`${module}: está en \`entry\` de knip y no es un módulo de \`src/modules\``);
    }
  }
  return problems;
}

/** Los `vi.mock` de un `index.ts` que no se dejan leer o sobrescriben un nombre que no se exporta. */
function staleMocks(found: ModuleInterfaces): string[] {
  const exported = new Map(found.modules.map((each) => [each.module, new Set(each.exported)]));
  return found.mocks.flatMap((mock) =>
    mock.names === null
      ? [`${mock.path}:${mock.line}: no se puede leer qué sobrescribe de @/modules/${mock.module}`]
      : mock.names
          .filter((name) => !exported.get(mock.module)?.has(name))
          .map(
            (name) =>
              `${mock.path}:${mock.line}: sobrescribe \`${name}\`, que @/modules/${mock.module} no exporta`,
          ),
  );
}

const file = (path: string, text: string) => ({ path, text });
const lines = (...text: string[]) => text.join("\n");

// Una casa de mentira, con cada forma de exportar un nombre y de importarlo.
const HOUSE = [
  file(
    "src/modules/alpha/index.ts",
    lines(
      'export { aliased, nobody, onlyDomain, onlyOwn, onlyTests, reexported, used } from "./domain/things";',
      'export type { QueriedType, UnusedType, UsedType } from "./domain/things";',
      'export { inner as renamed } from "./domain/things";',
      'export * from "./domain/star";',
    ),
  ),
  file(
    "src/modules/alpha/domain/star.ts",
    lines(
      "export function fromStar() {}",
      "export const starOne = 1,",
      "  starTwo = 2;",
      "export type StarType = string;",
      "export default function ignored() {}",
    ),
  ),
  file("src/modules/alpha/components/Card.tsx", 'import { onlyOwn } from "@/modules/alpha";'),
  file("src/modules/alpha/domain/reads.ts", 'import { onlyDomain } from "..";'),
  file("src/modules/beta/index.ts", 'export { reexported } from "@/modules/alpha";'),
  file(
    "src/app/page.tsx",
    lines(
      "import {",
      "  aliased as local,",
      "  type UsedType,",
      "  used,",
      '} from "@/modules/alpha";',
      'import type { StarType } from "@/modules/alpha/index";',
      'export let row: import("@/modules/alpha").QueriedType;',
      'export const label = "@/modules/alpha";',
    ),
  ),
  file("scripts/seed.ts", 'import { fromStar } from "../src/modules/alpha";'),
];
const HOUSE_TESTS = [
  file(
    "tests/unit/alpha.test.ts",
    lines(
      'import { onlyTests, used } from "@/modules/alpha";',
      'const { starTwo } = await import("@/modules/alpha");',
    ),
  ),
];
const HOUSE_EXCEPTIONS: Exceptions = {
  alpha: {
    nadie: "UnusedType nobody onlyDomain renamed starOne",
    "solo-pruebas": "onlyTests starTwo",
  },
  beta: { nadie: "reexported" },
};

const production = PRODUCTION_DIRS.flatMap(sources);
const tests = sources("tests");
const today = moduleInterfaces(production, tests);

describe("la interfaz pública de los módulos, sobre el código de hoy", () => {
  it("un index.ts exporta lo que producción importa de afuera, más la lista de excepciones: ni un nombre más ni uno menos", () => {
    expect(mismatches(today.modules, EXCEPTIONS)).toEqual([]);
  });

  it("recorre cada módulo de src/modules, y cada uno exporta algo", () => {
    const folders = readdirSync("src/modules", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(today.modules.map((found) => found.module)).toEqual(folders);
    expect(today.modules.filter((found) => found.exported.length === 0)).toEqual([]);
  });

  it("knip toma de entrada el index.ts de un módulo solo mientras le queda algo por podar, y los nombra uno por uno: el que vacía su clase «nadie» sale de la lista", () => {
    expect(
      entryMismatches(
        knipEntries(readFileSync("knip.ts", "utf8")),
        today.modules.map((found) => found.module),
        EXCEPTIONS,
      ),
    ).toEqual([]);
  });

  it("cada nombre de la lista está una sola vez en su módulo y en orden", () => {
    for (const [module, classes] of Object.entries(EXCEPTIONS)) {
      const all = CLASSES.flatMap((kind) => namesOf(classes[kind]));
      expect(
        all.filter((name, position) => all.indexOf(name) !== position),
        module,
      ).toEqual([]);
      for (const kind of CLASSES) {
        const names = namesOf(classes[kind]);
        expect(names, `${module} · ${kind}`).toEqual([...names].sort());
      }
    }
  });

  it("nadie toma un index.ts entero: un import *, un import() sin desestructurar o un typeof import() usan nombres que la cuenta no ve", () => {
    expect(today.opaque).toEqual([]);
  });

  it("un vi.mock de un index.ts se deja leer y solo sobrescribe nombres que ese index.ts exporta: sobre un nombre podado no tendría efecto", () => {
    expect(staleMocks(today)).toEqual([]);
    expect(today.mocks.length).toBeGreaterThan(0);
  });

  it("una clave sembrada en el objeto que un vi.mock de verdad esparce con `...`, sin tocar el archivo, sale como nombre que el index.ts no exporta", () => {
    const path = "tests/unit/competition-hub-api.test.ts";
    const hoisted = "const competitionModule = vi.hoisted(() => ({";
    const seeded = tests.map((source) =>
      source.path === path
        ? file(path, source.text.replace(hoisted, `${hoisted}\n  seededKey: vi.fn(),`))
        : source,
    );
    const stale = staleMocks(moduleInterfaces(production, seeded));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain(`${path}:`);
    expect(stale[0]).toContain("sobrescribe `seededKey`, que @/modules/competition no exporta");
  });

  it("un export sembrado en un index.ts de verdad, sin tocar el archivo, cae fuera de la lista", () => {
    const seeded = production.map((source) =>
      source.path === "src/modules/terms/index.ts"
        ? file(source.path, `${source.text}\nexport { seededExport } from "./domain/terms";\n`)
        : source,
    );
    expect(mismatches(moduleInterfaces(seeded, tests).modules, EXCEPTIONS)).toEqual([
      "terms: `seededExport` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «nadie»)",
    ]);
  });
});

describe("la cuenta de la interfaz pública, sobre una casa de mentira", () => {
  it("cuenta como uso el import con nombre, el de tipo, el alias, el reexport, el relativo y el tipo consultado; el de un componente propio salva el nombre; el de un archivo de dominio del módulo y el de una prueba, no", () => {
    expect(moduleInterfaces(HOUSE, HOUSE_TESTS).modules).toEqual([
      {
        module: "alpha",
        exported: [
          "QueriedType",
          "StarType",
          "UnusedType",
          "UsedType",
          "aliased",
          "fromStar",
          "nobody",
          "onlyDomain",
          "onlyOwn",
          "onlyTests",
          "reexported",
          "renamed",
          "starOne",
          "starTwo",
          "used",
        ],
        unused: [
          "UnusedType",
          "nobody",
          "onlyDomain",
          "onlyTests",
          "renamed",
          "starOne",
          "starTwo",
        ],
        testOnly: ["onlyTests", "starTwo"],
        ownComponentOnly: ["onlyOwn"],
      },
      {
        module: "beta",
        exported: ["reexported"],
        unused: ["reexported"],
        testOnly: [],
        ownComponentOnly: [],
      },
    ]);
  });

  it("un export nuevo que nadie importa pone la lista en rojo, y deja de hacerlo cuando alguien de afuera lo importa", () => {
    expect(mismatches(moduleInterfaces(HOUSE, HOUSE_TESTS).modules, HOUSE_EXCEPTIONS)).toEqual([]);

    const seeded = HOUSE.map((source) =>
      source.path === "src/modules/alpha/index.ts"
        ? file(source.path, `${source.text}\nexport { seeded } from "./domain/things";`)
        : source,
    );
    expect(mismatches(moduleInterfaces(seeded, HOUSE_TESTS).modules, HOUSE_EXCEPTIONS)).toEqual([
      "alpha: `seeded` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «nadie»)",
    ]);

    const consumed = [
      ...seeded,
      file("src/app/other/page.tsx", 'import { seeded } from "@/modules/alpha";'),
    ];
    expect(mismatches(moduleInterfaces(consumed, HOUSE_TESTS).modules, HOUSE_EXCEPTIONS)).toEqual(
      [],
    );
  });

  it("una excepción que sobra, una que quedó en otra clase y un módulo que no existe ponen la lista en rojo", () => {
    const listed: Exceptions = {
      alpha: {
        nadie: "UnusedType nobody onlyDomain onlyTests renamed starOne used gone",
        "solo-pruebas": "starTwo",
      },
      beta: { nadie: "reexported" },
      gamma: { nadie: "anything" },
    };
    expect(mismatches(moduleInterfaces(HOUSE, HOUSE_TESTS).modules, listed)).toEqual([
      "alpha: `onlyTests` está como «nadie» y hoy es «solo-pruebas»",
      "alpha: `used` sobra en «nadie»: ya lo importa producción de afuera o un componente del módulo",
      "alpha: `gone` sobra en «nadie»: el `index.ts` ya no lo exporta",
      "gamma: está en la lista y no es un módulo de `src/modules`",
    ]);
  });

  it("la entrada de knip sigue a la lista: un patrón, un módulo podado que sigue de entrada, uno con nombres por podar que falta, uno repetido y uno que no existe la ponen en rojo", () => {
    const modules = ["alpha", "beta", "competition", "gamma"];
    const exceptions: Exceptions = {
      alpha: { nadie: "nobody", "solo-pruebas": "onlyTests" },
      beta: { "solo-pruebas": "tested" },
      competition: { competition: "quiet" },
    };
    const index = (module: string) => `src/modules/${module}/index.ts`;
    const elsewhere = ["scripts/bench.ts", "tests/e2e/auth.setup.ts", ".railway/**/*.ts"];
    expect(
      entryMismatches([...elsewhere, index("alpha"), index("competition")], modules, exceptions),
    ).toEqual([]);
    expect(entryMismatches([], ["beta", "gamma"], exceptions)).toEqual([]);

    expect(entryMismatches(["src/modules/*/index.ts"], modules, exceptions)).toEqual([
      "`src/modules/*/index.ts`: una entrada de knip que alcanza `src` nombra el `index.ts` de un módulo, no un patrón ni otro archivo",
      "alpha: le queda algo por podar y su `index.ts` no está en `entry` de knip",
      "competition: le queda algo por podar y su `index.ts` no está en `entry` de knip",
    ]);
    for (const pattern of ["**/index.ts", "{src,scripts}/**/*.ts", "src/modules/alpha/admin.ts"]) {
      expect(
        entryMismatches([pattern, index("alpha"), index("competition")], modules, exceptions),
      ).toEqual([
        `\`${pattern}\`: una entrada de knip que alcanza \`src\` nombra el \`index.ts\` de un módulo, no un patrón ni otro archivo`,
      ]);
    }
    expect(
      entryMismatches(
        [index("alpha"), index("beta"), index("gamma"), index("alpha"), index("delta")],
        modules,
        exceptions,
      ),
    ).toEqual([
      "alpha: su `index.ts` está dos veces en `entry` de knip",
      "beta: no le queda nada por podar y su `index.ts` sigue en `entry` de knip, que así no analiza sus exports",
      "competition: le queda algo por podar y su `index.ts` no está en `entry` de knip",
      "gamma: no le queda nada por podar y su `index.ts` sigue en `entry` de knip, que así no analiza sus exports",
      "delta: está en `entry` de knip y no es un módulo de `src/modules`",
    ]);
  });

  it("lee las entradas de knip del texto de knip.ts, sin los comentarios, y falla si entry no es una lista de textos escritos ahí", () => {
    const config = (entry: string) =>
      lines("const config: KnipConfig = {", entry, '  project: ["src/**/*.ts"],', "};");
    expect(
      knipEntries(
        config(
          lines(
            "  entry: [",
            '    // Un comentario que nombra "src/modules/*/index.ts" no es una entrada.',
            "    // Tampoco corta la lista un comentario con un corchete: [nota].",
            '    "scripts/bench.ts",',
            '    "src/modules/alpha/index.ts",',
            '    ".railway/**/*.ts",',
            "  ],",
          ),
        ),
      ),
    ).toEqual(["scripts/bench.ts", "src/modules/alpha/index.ts", ".railway/**/*.ts"]);
    expect(knipEntries(config("  entry: [],"))).toEqual([]);
    expect(() =>
      knipEntries(config('  entry: [...MODULES.map(index), "scripts/bench.ts"],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() =>
      knipEntries(config('  entry: ["scripts/bench.ts", `src/modules/alpha/index.ts`],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() =>
      knipEntries(config('  entry: ["scripts/bench.ts", /* ] */ "src/modules/*/index.ts"],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() => knipEntries('const config = { entry: ["scripts/bench.ts",')).toThrow(
      "tiene algo que no es un texto",
    );
    expect(() => knipEntries(config("  entry: ENTRIES,"))).toThrow("no es una lista escrita ahí");
    expect(() => knipEntries(config(""))).toThrow("no es una lista escrita ahí");
  });

  it("lo de competition que nadie importa va en su propia clase, y lo que solo importa una prueba, en solo-pruebas", () => {
    const { modules } = moduleInterfaces(
      [file("src/modules/competition/index.ts", 'export { quiet, tested } from "./domain/hub";')],
      [file("tests/unit/hub.test.ts", 'import { tested } from "@/modules/competition";')],
    );
    expect(
      mismatches(modules, { competition: { competition: "quiet", "solo-pruebas": "tested" } }),
    ).toEqual([]);
    expect(mismatches(modules, { competition: { nadie: "quiet tested" } })).toEqual([
      "competition: `quiet` está como «nadie» y hoy es «competition»",
      "competition: `tested` está como «nadie» y hoy es «solo-pruebas»",
    ]);
  });

  it("avisa de lo que no puede seguir, en producción y en pruebas: import *, import por defecto, export *, import() sin desestructurar, require y typeof import()", () => {
    const { opaque } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { used } from "./domain/things";'),
        file(
          "src/app/whole.ts",
          lines(
            'import * as alpha from "@/modules/alpha";',
            'import whole from "@/modules/alpha";',
            'export * from "@/modules/alpha";',
            'const later = await import("@/modules/alpha");',
            'type Whole = typeof import("@/modules/alpha");',
          ),
        ),
      ],
      [file("tests/unit/whole.test.ts", 'const alpha = require("@/modules/alpha");')],
    );
    expect(opaque.map(({ path, line, how }) => `${path}:${line} ${how}`)).toEqual([
      'src/app/whole.ts:1 import * as alpha from "@/modules/alpha";',
      'src/app/whole.ts:2 import whole from "@/modules/alpha";',
      'src/app/whole.ts:3 export * from "@/modules/alpha";',
      'src/app/whole.ts:4 import("@/modules/alpha")',
      'src/app/whole.ts:5 typeof import("@/modules/alpha")',
      'tests/unit/whole.test.ts:1 require("@/modules/alpha")',
    ]);
  });

  it("lee lo que sobrescribe un vi.mock: el objeto literal y el que llega por vi.hoisted, sin lo que trae el módulo de verdad; un mock no es un import", () => {
    const { mocks, opaque, modules } = moduleInterfaces(
      [file("src/modules/alpha/index.ts", 'export { other, used } from "./domain/things";')],
      [
        file(
          "tests/unit/mocks.test.ts",
          lines(
            "const whole = vi.hoisted(() => ({ used: vi.fn() }));",
            'vi.mock("@/modules/alpha", () => whole);',
            'vi.mock("@/modules/alpha", async (importOriginal) => ({',
            '  ...(await importOriginal<typeof import("@/modules/alpha")>()),',
            "  other: vi.fn(),",
            "  gone: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async (importOriginal) => {',
            '  const mod = await importOriginal<typeof import("@/modules/alpha")>();',
            "  return { ...mod, used: () => null };",
            "});",
            'vi.mock("@/modules/alpha");',
            'vi.mock("@/modules/alpha", () => build());',
          ),
        ),
      ],
    );
    expect(mocks.map((mock) => [mock.line, mock.names])).toEqual([
      [2, ["used"]],
      [3, ["other", "gone"]],
      [8, ["used"]],
      [12, []],
      [13, null],
    ]);
    expect(opaque).toEqual([]);
    expect(modules.map((found) => found.testOnly)).toEqual([[]]);
  });

  it("sigue lo que entra a la fábrica de un vi.mock con `...`: suma las claves de una constante o de un vi.hoisted, deja pasar el index.ts de verdad y los archivos del propio módulo, y no da por leído lo demás", () => {
    const { mocks } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { other, used } from "./domain/things";'),
        file("src/modules/alpha/domain/things.ts", "export const inner = 0, other = 1, used = 2;"),
        file("src/modules/beta/index.ts", 'export { foreign } from "./domain/things";'),
        file("src/shared/kit.ts", "export const kit = 1;"),
      ],
      [
        file(
          "tests/unit/spreads.test.ts",
          lines(
            "const hoisted = vi.hoisted(() => ({ used: vi.fn(), gone: vi.fn() }));",
            "const plain = { other: 1 };",
            'vi.mock("@/modules/alpha", async () => {',
            '  const pure = await vi.importActual<typeof import("@/modules/alpha/domain/things")>(',
            '    "@/modules/alpha/domain/things",',
            "  );",
            "  return { ...hoisted, other: pure.other };",
            "});",
            'vi.mock("@/modules/alpha", () => ({ ...plain, used: vi.fn() }));',
            'vi.mock("@/modules/alpha", async () => ({',
            '  ...(await import("@/modules/alpha/domain/things")),',
            '  ...(await vi.importActual("../../src/modules/alpha/domain/things")),',
            "  used: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async () => ({',
            '  ...(await vi.importActual<typeof import("@/modules/alpha")>("@/modules/alpha")),',
            '  ...(await import("@/modules/alpha")),',
            "  other: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/shared/kit")), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/modules/alpha/domain/missing")), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/modules/beta/domain/things")), used: 1 }));',
            'vi.mock("@/modules/alpha", () => ({ ...build(), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await importOriginal()), used: 1 }));',
            'vi.mock("@/modules/alpha", () => ({ ...unknown, used: 1 }));',
          ),
        ),
      ],
    );
    expect(mocks.map((mock) => [mock.line, mock.names])).toEqual([
      [3, ["used", "gone", "other"]],
      [9, ["other", "used"]],
      [10, ["used"]],
      [15, ["other"]],
      [20, null],
      [21, null],
      [22, null],
      [23, null],
      [24, null],
      [25, null],
    ]);
  });

  it("dentro de la fábrica de un vi.mock solo deja de contar la carga del módulo que se simula; la de otro módulo cuenta, y vi.importActual y vi.importMock cargan un index.ts como un import()", () => {
    const { modules, opaque } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { mocked, viaActual } from "./domain/things";'),
        file(
          "src/modules/beta/index.ts",
          'export { inFactory, untouched } from "./domain/things";',
        ),
      ],
      [
        file(
          "tests/unit/loads.test.ts",
          lines(
            'vi.mock("@/modules/alpha", async () => {',
            '  const { inFactory } = await import("@/modules/beta");',
            "  return { mocked: inFactory };",
            "});",
            'const { viaActual } = await vi.importActual<typeof import("@/modules/alpha")>(',
            '  "@/modules/alpha",',
            ");",
            'const whole = await vi.importMock("@/modules/beta");',
          ),
        ),
      ],
    );
    expect(modules.map((found) => [found.module, found.testOnly])).toEqual([
      ["alpha", ["viaActual"]],
      ["beta", ["inFactory"]],
    ]);
    expect(opaque.map(({ path, line, how }) => `${path}:${line} ${how}`)).toEqual([
      'tests/unit/loads.test.ts:8 vi.importMock("@/modules/beta")',
    ]);
  });

  it("cuenta un export namespace y el export por defecto del propio index.ts, y falla ante un export que no sabe nombrar, en vez de contar de menos", () => {
    const index = (...text: string[]) => [file("src/modules/alpha/index.ts", lines(...text))];
    const { modules } = moduleInterfaces(
      index(
        "export namespace Grouped {",
        "  export const inner = 1;",
        "}",
        "export default function whole() {}",
      ),
      [],
    );
    expect(modules.map((found) => found.exported)).toEqual([["Grouped", "default"]]);
    expect(moduleInterfaces(index("export default 1;"), []).modules[0]?.exported).toEqual([
      "default",
    ]);

    expect(() => moduleInterfaces(index("export const { a, b } = pair;"), [])).toThrow(
      "desestructuración",
    );
    expect(() => moduleInterfaces(index('export module "quoted" {}'), [])).toThrow(
      "no sabe nombrar",
    );
    expect(() => moduleInterfaces(index("export = whole;"), [])).toThrow("no sabe nombrar");
  });

  it("falla si no puede seguir un export *, en vez de contar de menos", () => {
    expect(() =>
      moduleInterfaces(
        [file("src/modules/alpha/index.ts", 'export * from "./domain/missing";')],
        [],
      ),
    ).toThrow("export *");
  });
});
