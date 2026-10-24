import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import {
  card,
  interaction,
  internalCallEntry,
  onboardingProgress,
  organizationContact,
  recognition,
  request,
  task,
} from "../schema";
import { REQUEST_PAYLOAD_SCHEMAS } from "./requests-pure";

/** Proyecciones del titular, sin DTO administrativos ni identidades de quienes operaron. */
export async function collectOwnCrmData(personId: string) {
  const db = getDb();
  const [
    interactions,
    taskRows,
    requestRows,
    internalCallEntries,
    recognitions,
    onboarding,
    organizationContacts,
    cards,
  ] = await Promise.all([
    db
      .select({
        id: interaction.id,
        kind: interaction.kind,
        occurredAt: interaction.occurredAt,
        actorId: interaction.actorId,
        summary: interaction.summary,
        body: interaction.body,
        editedAt: interaction.editedAt,
        createdAt: interaction.createdAt,
      })
      .from(interaction)
      .where(eq(interaction.personId, personId))
      .orderBy(desc(interaction.occurredAt), desc(interaction.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: task.id,
        kind: task.kind,
        title: task.title,
        createdById: task.createdById,
        dueAt: task.dueAt,
        status: task.status,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
      })
      .from(task)
      .where(eq(task.personId, personId))
      .orderBy(desc(task.createdAt), desc(task.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: request.id,
        kind: request.kind,
        termId: request.termId,
        occasionId: request.occasionId,
        payload: request.payload,
        status: request.status,
        decidedAt: request.decidedAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })
      .from(request)
      .where(eq(request.personId, personId))
      .orderBy(desc(request.createdAt), desc(request.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: internalCallEntry.id,
        callId: internalCallEntry.callId,
        status: internalCallEntry.status,
        decidedAt: internalCallEntry.decidedAt,
        createdAt: internalCallEntry.createdAt,
      })
      .from(internalCallEntry)
      .where(eq(internalCallEntry.personId, personId))
      .orderBy(desc(internalCallEntry.createdAt), desc(internalCallEntry.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: recognition.id,
        kind: recognition.kind,
        committeeId: recognition.committeeId,
        termId: recognition.termId,
        month: recognition.month,
        title: recognition.title,
        award: recognition.award,
        createdAt: recognition.createdAt,
      })
      .from(recognition)
      .where(eq(recognition.personId, personId))
      .orderBy(desc(recognition.createdAt), desc(recognition.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: onboardingProgress.id,
        termId: onboardingProgress.termId,
        stepKey: onboardingProgress.stepKey,
        doneAt: onboardingProgress.doneAt,
        source: onboardingProgress.source,
        createdAt: onboardingProgress.createdAt,
      })
      .from(onboardingProgress)
      .where(eq(onboardingProgress.personId, personId))
      .orderBy(desc(onboardingProgress.createdAt), desc(onboardingProgress.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: organizationContact.id,
        organizationId: organizationContact.organizationId,
        role: organizationContact.role,
        isPrimary: organizationContact.isPrimary,
        createdAt: organizationContact.createdAt,
      })
      .from(organizationContact)
      .where(eq(organizationContact.personId, personId))
      .orderBy(desc(organizationContact.createdAt), desc(organizationContact.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: card.id,
        pipelineId: card.pipelineId,
        stageId: card.stageId,
        editionId: card.editionId,
        enteredStageAt: card.enteredStageAt,
        closedAt: card.closedAt,
        createdAt: card.createdAt,
      })
      .from(card)
      .where(eq(card.personId, personId))
      .orderBy(desc(card.createdAt), desc(card.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  return ownDataCollections({
    timeline: interactions.map((row) => ({
      id: row.id,
      kind: row.kind,
      occurredAt: row.occurredAt,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
      // Una nota de otra persona puede contener confidencias de terceros. Su autoría no viaja.
      ...(row.actorId === personId && row.kind === "NOTE"
        ? { summary: row.summary, body: row.body }
        : {}),
    })),
    tasks: taskRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      dueAt: row.dueAt,
      status: row.status,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      ...(row.createdById === personId ? { title: row.title } : {}),
    })),
    requests: requestRows.map((row) => {
      const parsed = REQUEST_PAYLOAD_SCHEMAS[row.kind].safeParse(row.payload);
      return {
        ...row,
        payload: parsed.success ? parsed.data : null,
        payloadAvailable: parsed.success,
      };
    }),
    internalCallEntries,
    recognitions,
    onboarding,
    organizationContacts,
    cards,
  });
}
