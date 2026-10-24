import { actorContext } from "@/app/_lib/actor";
import { redirectFromDownload } from "@/app/_lib/download";
import { collectOwnCommsData, getPreferences, listSubscriptionsFor } from "@/modules/comms";
import { listStaffFor } from "@/modules/competition";
import { collectOwnMediaData } from "@/modules/content";
import { collectOwnCrmData } from "@/modules/crm";
import { collectOwnFormsData } from "@/modules/forms";
import {
  collectOwnIdentityData,
  getActor,
  getCarnetMetadata,
  hasRecentStepUp,
  listPermissionsFor,
  listSessionsFor,
} from "@/modules/identity";
import {
  collectOwnParticipationData,
  listAchievementsForPerson,
  listBoostersFor,
  listColorRunsFor,
  listEvidenceFilesFor,
  listGame2048RunsFor,
  listGamerHistoryFor,
  listPanalGamesFor,
  listParticipationsForPerson,
  listPresenceHistoryFor,
  listRewardsForPerson,
  listSudokuRunsFor,
  listWordleGamesFor,
} from "@/modules/participation";
import { collectPersonalData } from "@/modules/people";
import { collectOwnPermanenceData } from "@/modules/permanence";
import { collectOwnAuditData, recordSelfExport } from "@/modules/system";
import { listPassesFor } from "@/modules/wallet";
import type { OwnDataLimit } from "@/shared/lib/own-data";

// Acceso del titular (ADR-143): sesión y paso reciente antes de toda lectura; cada módulo entrega
// su proyección propia. Los topes y lo que requiere revisión quedan declarados en el archivo.

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) {
    // La descarga sale de la sección de privacidad de Ajustes (ADR-113, regla 10).
    return redirectFromDownload("SIGN_IN", "/app/ajustes");
  }
  if (!hasRecentStepUp(actor)) {
    return redirectFromDownload("STEP_UP", "/app/ajustes");
  }
  const data = await collectPersonalData(actor.personId);
  if (!data) {
    return new Response("No existe", { status: 404, headers: { "cache-control": "no-store" } });
  }
  const { exportLimits: peopleLimits, ...personalData } = data;
  const [
    comms,
    crm,
    forms,
    participation,
    permanence,
    identity,
    media,
    sessions,
    permissions,
    preferences,
    subscriptions,
    carnet,
    passes,
    wordleGames,
    game2048Runs,
    colorRuns,
    sudokuRuns,
    panalGames,
    participations,
    evidenceFiles,
    boosters,
    achievements,
    rewards,
    competitionStaff,
    gamerParticipations,
    presenceRecognitions,
  ] = await Promise.all([
    collectOwnCommsData(actor.personId),
    collectOwnCrmData(actor.personId),
    collectOwnFormsData(actor.personId),
    collectOwnParticipationData(actor.personId),
    collectOwnPermanenceData(actor.personId),
    collectOwnIdentityData(actor.personId),
    collectOwnMediaData(actor.personId),
    listSessionsFor(actor.personId),
    listPermissionsFor(actor.personId),
    getPreferences(actor.personId),
    listSubscriptionsFor(actor.personId),
    getCarnetMetadata(actor.personId),
    listPassesFor(actor.personId),
    listWordleGamesFor(actor.personId),
    listGame2048RunsFor(actor.personId),
    listColorRunsFor(actor.personId),
    listSudokuRunsFor(actor.personId),
    listPanalGamesFor(actor.personId),
    listParticipationsForPerson(actor.personId),
    listEvidenceFilesFor(actor.personId),
    listBoostersFor(actor.personId),
    listAchievementsForPerson(actor.personId),
    listRewardsForPerson(actor.personId),
    listStaffFor(actor.personId),
    listGamerHistoryFor(actor.personId),
    listPresenceHistoryFor(actor.personId),
  ]);
  const { auditSubjects: identitySubjects, ...identityData } = identity;
  const audit = await collectOwnAuditData({
    ...identitySubjects,
    ...participation.auditSubjects,
    person: [actor.personId],
    notification_preference: [actor.personId],
    calendar_token: [actor.personId],
    carnet_token: [actor.personId],
    media_asset: media.data.mediaFiles.map((row) => row.id),
    push_subscription: subscriptions.map((row) => row.id),
    membership: data.membership ? [data.membership.id] : [],
    consent: data.consents.flatMap((state) => state.history.map((row) => row.id)),
    sanction: data.sanctions.map((row) => row.id),
    appointment: data.appointments.map((row) => row.id),
    interaction: crm.data.timeline.map((row) => row.id),
    task: crm.data.tasks.map((row) => row.id),
    request: crm.data.requests.map((row) => row.id),
    recognition: crm.data.recognitions.map((row) => row.id),
    onboarding_progress: crm.data.onboarding.map(
      (row) => `${actor.personId}:${row.termId}:${row.stepKey}`,
    ),
    card: crm.data.cards.map((row) => row.id),
    check_in: participation.data.checkIns.map((row) => row.id),
    point_entry: participation.data.pointEntries.map((row) => row.id),
    assembly_requirement: participation.data.assemblyRequirements.map((row) => row.id),
    occasion_survey_invite: participation.data.surveyInvitations.map((row) => row.id),
    presence_bonus: presenceRecognitions.bonuses.flatMap((row) => [
      row.id,
      `${actor.personId}:${row.termId}:${row.weekKey}`,
    ]),
    permanence_decision: [
      ...new Set(
        permanence.data.permanenceDecisions.map((row) => `${row.termId}:${actor.personId}`),
      ),
    ],
    leader_score: permanence.data.leaderScores.map((row) => `${row.ruleId}:${actor.personId}`),
    manual_credit: permanence.data.manualCredits.map((row) => `${row.ruleId}:${actor.personId}`),
    work_group_membership: permanence.data.workGroupMemberships.map((row) => row.id),
    challenge_participation: participations.map((row) => row.id),
    achievement: achievements.map((row) => row.id),
    booster_item: boosters.map((row) => row.id),
    wordle_game: wordleGames.map((row) => row.id),
    game2048_run: game2048Runs.map((row) => row.id),
    sudoku_run: sudokuRuns.map((row) => row.id),
    color_run: colorRuns.map((row) => row.id),
    panal_game: panalGames.map((row) => row.id),
  });
  await recordSelfExport(await actorContext(actor));
  const body = {
    exportedAt: new Date().toISOString(),
    ...personalData,
    ...comms.data,
    ...crm.data,
    ...forms.data,
    ...participation.data,
    ...permanence.data,
    ...identityData,
    ...media.data,
    ...audit.data,
    sessions: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      remembered: session.remembered,
      userAgent: session.userAgent,
      ip: session.ip,
    })),
    permissions: permissions.map((item) => ({ code: item.code, committeeId: item.committeeId })),
    wordleGames: wordleGames.map((game) => ({
      id: game.id,
      day: game.day,
      termId: game.termId,
      status: game.status,
      attempts: game.attempts,
      points: game.points,
      nextAvailableAt: game.nextAvailableAt,
    })),
    game2048Runs: game2048Runs.map((run) => ({
      id: run.id,
      day: run.day,
      status: run.status,
      score: run.score,
      maxTile: run.maxTile,
      moveCount: run.moveCount,
      points: run.points,
    })),
    colorRuns: colorRuns.map((run) => ({
      id: run.id,
      day: run.day,
      status: run.status,
      round: run.round,
      target: null,
      watchUntil: null,
      average: run.average,
      points: run.points,
      results: run.results.map((result) => ({
        round: result.round,
        accuracy: result.accuracy,
        target: { h: result.target.h, s: result.target.s, l: result.target.l },
        answer: { h: result.answer.h, s: result.answer.s, l: result.answer.l },
      })),
    })),
    // Sudoku (ADR-078): dificultad, modo, estado y puntos; sin semilla, dadas ni solución.
    sudokuRuns: sudokuRuns.map((run) => ({
      id: run.id,
      day: run.day,
      status: run.status,
      difficulty: run.difficulty,
      assisted: run.assisted,
      points: run.points,
    })),
    panalGames: panalGames.map((game) => ({
      id: game.id,
      day: game.day,
      words: game.words,
      score: game.score,
      points: game.points,
      awardedCheckpoints: game.awardedCheckpoints,
      complete: game.complete,
    })),
    gamerParticipations: gamerParticipations.map((row) => ({
      termId: row.termId,
      day: row.day,
      game: row.game,
    })),
    presenceRecognitions: {
      seasons: presenceRecognitions.seasons.map((season) => ({
        termId: season.termId,
        recognitionAvailable: season.recognitionAvailable,
        launched: season.launched,
        currentStreak: season.currentStreak,
        longestStreak: season.longestStreak,
        weekStatus: season.weekStatus,
        weekKey: season.weekKey,
        bonus: season.bonus,
        nextBonus: season.nextBonus,
        weekPauseReasons: season.weekPauseReasons,
        weeks: season.weeks.map((week) => ({
          weekKey: week.weekKey,
          status: week.status,
          streak: week.streak,
          bonus: week.bonus,
          pauseReasons: week.pauseReasons,
        })),
      })),
      bonuses: presenceRecognitions.bonuses.map((bonus) => ({
        id: bonus.id,
        termId: bonus.termId,
        weekKey: bonus.weekKey,
        version: bonus.version,
        streakWeeks: bonus.streakWeeks,
        points: bonus.points,
        createdAt: bonus.createdAt,
      })),
    },
    // The Games (ADR-089, ADR-101): dónde está asignada la persona como operadora, líder de base
    // (jueza) o apoyo de una base (calificadora, veedora o VAR).
    competitionStaff: competitionStaff.map((row) => ({
      competition: row.competition,
      role: row.role,
      base: row.base,
      createdAt: row.createdAt,
    })),
    // Gamificación (ADR-067): entregas sin `requestId` ni la posición correcta de la trivia;
    // archivos sin `objectKey` (dirección interna del bucket); premios y logros de la colección.
    challengeParticipations: participations.map((item) => ({
      id: item.id,
      challengeId: item.challengeId,
      status: item.status,
      submittedAt: item.submittedAt,
      answers: item.answers,
      score: item.score,
      passed: item.passed,
      evidenceText: item.evidenceText,
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    evidenceFiles: evidenceFiles.map((file) => ({
      id: file.id,
      participationId: file.participationId,
      ordinal: file.ordinal,
      status: file.status,
      byteSize: file.byteSize,
      createdAt: file.createdAt,
    })),
    boosters: boosters.map((item) => ({
      id: item.id,
      kind: item.kind,
      state: item.state,
      expiresAt: item.expiresAt,
      target: item.target
        ? {
            kind: item.target.kind,
            id: item.target.id,
            title: item.target.title,
            href: item.target.href,
          }
        : null,
      origin:
        item.origin?.kind === "MANUAL"
          ? { kind: item.origin.kind }
          : item.origin
            ? { kind: item.origin.kind, label: item.origin.label }
            : null,
    })),
    achievements: achievements.map((item) => ({
      id: item.id,
      badge: {
        code: item.badge.code,
        name: item.badge.name,
        family: item.badge.family,
        level: item.badge.level,
      },
      unlockedAt: item.unlockedAt,
      termId: item.termId,
      historical: item.historical,
      seenAt: item.seenAt,
      featuredPosition: item.featuredPosition,
      revokedAt: item.revokedAt,
    })),
    rewards: rewards.map((row) => ({
      source: row.source,
      status: row.status,
      basePoints: row.basePoints,
      extraPoints: row.extraPoints,
      dayKey: row.dayKey,
      weekKey: row.weekKey,
      reservedAt: row.reservedAt,
      decidedAt: row.decidedAt,
    })),
    carnet: carnet
      ? {
          walletEpoch: carnet.walletEpoch,
          revision: carnet.revision,
          createdAt: carnet.createdAt,
          lastUsedAt: carnet.lastUsedAt,
        }
      : null,
    walletPasses: passes.map((pass) => ({
      id: pass.id,
      platform: pass.platform,
      externalId: pass.externalId,
      walletEpoch: pass.walletEpoch,
      tokenRevision: pass.tokenRevision,
      renderedTermId: pass.renderedTermId,
      issuedAt: pass.issuedAt,
      lastIssuedAt: pass.lastIssuedAt,
      lastRefreshedAt: pass.lastRefreshedAt,
      revokedAt: pass.revokedAt,
    })),
    // Comunicaciones (ADR-038 regla 11): preferencias y dispositivos, sin las claves del navegador.
    notificationPreferences: {
      emailCampaigns: preferences.emailCampaigns,
      pushAnnouncements: preferences.pushAnnouncements,
      pushPoints: preferences.pushPoints,
      pushReminders: preferences.pushReminders,
      pushWordle: preferences.pushWordle,
      pushGamerStreak: preferences.pushGamerStreak,
    },
    pushSubscriptions: subscriptions.map((item) => ({
      id: item.id,
      service: new URL(item.endpoint).host,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt,
    })),
  };
  const collections: Record<string, OwnDataLimit> = {
    ...Object.fromEntries(
      Object.entries(body)
        .filter(([, rows]) => Array.isArray(rows))
        .map(([key, rows]) => [
          key,
          { limit: null, returned: (rows as unknown[]).length, truncated: false },
        ]),
    ),
    ...peopleLimits,
    ...comms.limits,
    ...crm.limits,
    ...forms.limits,
    ...participation.limits,
    ...permanence.limits,
    ...audit.limits,
    ...media.limits,
    "consents.history": {
      limit: null,
      returned: data.consents.reduce((n, state) => n + state.history.length, 0),
      truncated: false,
    },
    "presenceRecognitions.seasons": {
      limit: null,
      returned: presenceRecognitions.seasons.length,
      truncated: false,
    },
    "presenceRecognitions.bonuses": {
      limit: null,
      returned: presenceRecognitions.bonuses.length,
      truncated: false,
    },
  };
  const exportCoverage = {
    version: 1,
    collections,
    truncated: Object.values(collections).some((collection) => collection.truncated),
    reviewRequired: [
      "timeline.otherAuthors.summary",
      "timeline.otherAuthors.body",
      "timeline.metadata",
      "tasks.otherAuthors.title",
      "cards.title",
      "cards.fields",
      "events.reason",
      "probation.reason",
      "membership.leaveCondition.invalidHistory",
      "sanctions.cause",
      "sanctions.revokeReason",
      "requests.reason",
      "requests.unrecognizedPayload",
      "formSubmissions.unrecognizedAnswers",
      "internalCallEntries.note",
      "checkIns.reason",
      "pointEntries.reason",
      "assemblyRequirements.adjustedReason",
      "permanenceSnapshots.internalDetails",
      "permanenceDecisions.reason",
      "leaderScores.note",
      "manualCredits.reason",
      "workGroupMemberships.note",
      "challengeParticipations.reason",
      "boosters.origin.reason",
      "auditHistory.before",
      "auditHistory.after",
    ],
    excluded: [
      "credentials",
      "accessTokens",
      "pushSubscriptions.endpointAndKeys",
      "messages.providerErrors",
      "pushDeliveries.errorAndDevice",
      "gameSolutionsAndSeeds",
      "bucketObjectKeys",
      "anonymousSurveyAnswers",
    ],
    scope: {
      formSubmissions: "linked-person-id",
      sessions: "unexpired",
      auditHistory: {
        references: "owned-entities-in-this-export-before-export-self",
        sourceCollectionsTruncated: [
          "mediaFiles",
          "sanctions",
          "appointments",
          "timeline",
          "tasks",
          "requests",
          "recognitions",
          "onboarding",
          "cards",
          "checkIns",
          "pointEntries",
          "assemblyRequirements",
          "surveyInvitations",
          "permanenceDecisions",
          "leaderScores",
          "manualCredits",
          "workGroupMemberships",
        ].filter((key) => collections[key]?.truncated),
        deletedEntities: "not-attributed",
        permanenceDecisions: "one-person-term-operation-includes-all-committees",
      },
      files: "metadata-only",
      consistency: "per-module-reads",
    },
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ ...body, exportCoverage }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
