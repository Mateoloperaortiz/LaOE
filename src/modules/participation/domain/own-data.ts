import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getCurrentTerm } from "@/modules/terms";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import {
  assemblyRequirement,
  checkIn,
  occasionSurveyInvite,
  pointEntry,
  presenceBonus,
  reward,
} from "../schema";
import { getGamerProfile } from "./gamer";
import { balanceFor } from "./ledger";

/** Hechos propios completos; los motivos libres del personal requieren revisión (ADR-143). */
export async function collectOwnParticipationData(personId: string) {
  const db = getDb();
  const [checkIns, pointEntries, assemblyRequirements, surveyInvitations, presenceBonuses] =
    await Promise.all([
      db
        .select({
          id: checkIn.id,
          occasionId: checkIn.occasionId,
          status: checkIn.status,
          attendanceExtent: checkIn.attendanceExtent,
          attendanceList: checkIn.attendanceList,
          source: checkIn.source,
          at: checkIn.at,
          decidedAt: checkIn.decidedAt,
          createdAt: checkIn.createdAt,
        })
        .from(checkIn)
        .where(eq(checkIn.personId, personId))
        .orderBy(desc(checkIn.at), desc(checkIn.id))
        .limit(OWN_DATA_QUERY_LIMIT),
      db
        .select({
          id: pointEntry.id,
          termId: pointEntry.termId,
          kind: pointEntry.kind,
          points: pointEntry.points,
          checkInId: pointEntry.checkInId,
          wordleGameId: pointEntry.wordleGameId,
          game2048RunId: pointEntry.game2048RunId,
          sudokuRunId: pointEntry.sudokuRunId,
          colorRunId: pointEntry.colorRunId,
          panalGameId: pointEntry.panalGameId,
          panalCheckpoint: pointEntry.panalCheckpoint,
          rewardId: pointEntry.rewardId,
          presenceBonusId: pointEntry.presenceBonusId,
          reversalOfId: pointEntry.reversalOfId,
          createdAt: pointEntry.createdAt,
        })
        .from(pointEntry)
        .where(eq(pointEntry.personId, personId))
        .orderBy(desc(pointEntry.createdAt), desc(pointEntry.id))
        .limit(OWN_DATA_QUERY_LIMIT),
      db
        .select({
          id: assemblyRequirement.id,
          termId: assemblyRequirement.termId,
          requiredOrdinary: assemblyRequirement.requiredOrdinary,
          requiresBoardElection: assemblyRequirement.requiresBoardElection,
          requiresRunoff: assemblyRequirement.requiresRunoff,
          createdAt: assemblyRequirement.createdAt,
          updatedAt: assemblyRequirement.updatedAt,
        })
        .from(assemblyRequirement)
        .where(eq(assemblyRequirement.personId, personId))
        .orderBy(desc(assemblyRequirement.createdAt), desc(assemblyRequirement.id))
        .limit(OWN_DATA_QUERY_LIMIT),
      db
        .select({
          id: occasionSurveyInvite.id,
          occasionId: occasionSurveyInvite.occasionId,
          sentAt: occasionSurveyInvite.sentAt,
          answeredAt: occasionSurveyInvite.answeredAt,
          createdAt: occasionSurveyInvite.createdAt,
        })
        .from(occasionSurveyInvite)
        .where(eq(occasionSurveyInvite.personId, personId))
        .orderBy(desc(occasionSurveyInvite.createdAt), desc(occasionSurveyInvite.id))
        .limit(OWN_DATA_QUERY_LIMIT),
      db
        .select({
          id: presenceBonus.id,
          termId: presenceBonus.termId,
          weekKey: presenceBonus.weekKey,
          version: presenceBonus.version,
          streakWeeks: presenceBonus.streakWeeks,
          points: presenceBonus.points,
          createdAt: presenceBonus.createdAt,
        })
        .from(presenceBonus)
        .where(eq(presenceBonus.personId, personId))
        .orderBy(desc(presenceBonus.createdAt), desc(presenceBonus.id))
        .limit(OWN_DATA_QUERY_LIMIT),
    ]);
  // El historial heredado de premios no tiene límite. Sus referencias de auditoría tampoco se
  // recortan ni pasan por un id inferido desde el ledger: también hay reservas aún sin puntos.
  const rewardIds = await db
    .select({ id: reward.id })
    .from(reward)
    .where(eq(reward.personId, personId));
  const currentTerm = await getCurrentTerm();
  const currentGamification = currentTerm
    ? {
        termId: currentTerm.id,
        ghPoints: await balanceFor(personId, currentTerm.id),
        gamer: await getGamerProfile(personId, currentTerm.id),
      }
    : null;
  const collections = ownDataCollections({
    checkIns,
    pointEntries,
    assemblyRequirements,
    surveyInvitations,
    presenceBonuses,
  });
  return {
    ...collections,
    data: { ...collections.data, currentGamification },
    auditSubjects: { reward: rewardIds.map((row) => row.id) },
  };
}
