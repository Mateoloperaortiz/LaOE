import { redirectFromDownload } from "@/app/_lib/download";
import { getPreferences, listMessagesFor, listSubscriptionsFor } from "@/modules/comms";
import { listStaffFor } from "@/modules/competition";
import { listInteractions, listTasks } from "@/modules/crm";
import {
  getActor,
  getCarnetMetadata,
  listPermissionsFor,
  listSessionsFor,
} from "@/modules/identity";
import {
  listAchievementsForPerson,
  listBoostersFor,
  listEvidenceFilesFor,
  listGame2048RunsFor,
  listPanalGamesFor,
  listParticipationsForPerson,
  listRewardsForPerson,
  listSudokuRunsFor,
  listWordleGamesFor,
} from "@/modules/participation";
import { collectPersonalData } from "@/modules/people";
import { recordSelfExport } from "@/modules/system";
import { listPassesFor } from "@/modules/wallet";

// "Mis datos" (ADR-034 regla 12): todo lo que la OE guarda sobre la persona con sesión, en JSON,
// con las notas incluidas (ADR-014). Auditado y en la línea de tiempo; nunca con datos de terceros.

export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const actor = await getActor();
  if (!actor) {
    // La descarga sale de la sección de privacidad de Ajustes (ADR-113, regla 10).
    return redirectFromDownload("SIGN_IN", "/app/ajustes");
  }
  const data = await collectPersonalData(actor.personId);
  if (!data) {
    return new Response("No existe", { status: 404 });
  }
  const [
    timeline,
    tasks,
    messages,
    sessions,
    permissions,
    preferences,
    subscriptions,
    carnet,
    passes,
    wordleGames,
    game2048Runs,
    sudokuRuns,
    panalGames,
    participations,
    evidenceFiles,
    boosters,
    achievements,
    rewards,
    competitionStaff,
  ] = await Promise.all([
    listInteractions(actor.personId, "ALL", 1000),
    listTasks({ q: "", personId: actor.personId, page: 1, pageSize: 500 }),
    listMessagesFor(actor.personId),
    listSessionsFor(actor.personId),
    listPermissionsFor(actor.personId),
    getPreferences(actor.personId),
    listSubscriptionsFor(actor.personId),
    getCarnetMetadata(actor.personId),
    listPassesFor(actor.personId),
    listWordleGamesFor(actor.personId),
    listGame2048RunsFor(actor.personId),
    listSudokuRunsFor(actor.personId),
    listPanalGamesFor(actor.personId),
    listParticipationsForPerson(actor.personId),
    listEvidenceFilesFor(actor.personId),
    listBoostersFor(actor.personId),
    listAchievementsForPerson(actor.personId),
    listRewardsForPerson(actor.personId),
    listStaffFor(actor.personId),
  ]);
  await recordSelfExport(actor.personId);
  const body = {
    exportedAt: new Date().toISOString(),
    ...data,
    timeline,
    tasks: tasks.rows,
    messages,
    sessions: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      remembered: session.remembered,
      userAgent: session.userAgent,
      ip: session.ip,
    })),
    permissions,
    wordleGames,
    game2048Runs,
    // Sudoku (ADR-078): dificultad, modo, estado y puntos; sin semilla, dadas ni solución.
    sudokuRuns,
    panalGames,
    // The Games (ADR-089, ADR-101): dónde está asignada la persona como operadora, líder de base
    // (jueza) o apoyo de una base (calificadora, veedora o VAR).
    competitionStaff,
    // Gamificación (ADR-067): entregas sin `requestId` ni la posición correcta de la trivia;
    // archivos sin `objectKey` (dirección interna del bucket); premios y logros de la colección.
    challengeParticipations: participations.map((item) => ({
      challengeId: item.challengeId,
      status: item.status,
      submittedAt: item.submittedAt,
      answers: item.answers,
      score: item.score,
      evidenceText: item.evidenceText,
      reason: item.reason,
      decidedAt: item.decidedAt,
    })),
    evidenceFiles: evidenceFiles.map((file) => ({
      id: file.id,
      participationId: file.participationId,
      ordinal: file.ordinal,
      status: file.status,
      byteSize: file.byteSize,
      createdAt: file.createdAt,
    })),
    boosters,
    achievements: achievements.map((item) => ({
      badge: {
        code: item.badge.code,
        name: item.badge.name,
        family: item.badge.family,
        level: item.badge.level,
      },
      unlockedAt: item.unlockedAt,
      termId: item.termId,
      historical: item.historical,
      revokedAt: item.revokedAt,
    })),
    rewards,
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
    },
    pushSubscriptions: subscriptions.map((item) => ({
      id: item.id,
      service: new URL(item.endpoint).host,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt,
    })),
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
