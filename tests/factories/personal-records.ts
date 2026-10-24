import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { message, pushDelivery } from "@/modules/comms/schema";
import { recognition, task } from "@/modules/crm/schema";
import { hashToken } from "@/modules/identity/domain/pure";
import { accessGrant } from "@/modules/identity/schema";
import { assemblyRequirement, presenceBonus } from "@/modules/participation/schema";
import { deriveDates } from "@/modules/people/domain/sanction-pure";
import { personTag, sanction } from "@/modules/people/schema";
import { permanenceDecision } from "@/modules/permanence/schema";

/** Enlace de recuperación vigente, con hash y vigencia como los de issueAccessGrant. */
export async function seedRecoveryGrant(personId: string, issuedById: string) {
  const tokenHash = hashToken(randomUUID());
  const [row] = await getDb()
    .insert(accessGrant)
    .values({
      personId,
      kind: "RECOVERY",
      tokenHash,
      issuedById,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    })
    .returning({ id: accessGrant.id });
  if (!row) throw new Error("seed recovery grant");
  return { id: row.id, tokenHash };
}

/** Primera liquidación del bono de dos semanas; no acredita el libro ni audita. */
export async function seedPresenceBonus(personId: string, termId: string, weekKey: string) {
  const [row] = await getDb()
    .insert(presenceBonus)
    .values({
      personId,
      termId,
      weekKey,
      version: 1,
      streakWeeks: 2,
      points: 2,
    })
    .returning({ id: presenceBonus.id });
  if (!row) throw new Error("seed presence bonus");
  return row.id;
}

/** Llamado de atención con las fechas derivadas por el mismo cálculo que recordSanction. */
export async function seedWarningSanction(
  personId: string,
  termId: string,
  cause: string,
  occurredOn = "2026-08-10",
) {
  const dates = deriveDates("WARNING", occurredOn, null);
  if ("error" in dates) throw new Error("seed warning sanction: fecha inválida");
  const [row] = await getDb()
    .insert(sanction)
    .values({
      personId,
      termId,
      kind: "WARNING",
      cause,
      occurredOn,
      ...dates,
    })
    .returning({ id: sanction.id });
  if (!row) throw new Error("seed warning sanction");
  return row.id;
}

/** Confirmación de continuar en la OE; conserva la observación administrativa del cierre. */
export async function seedContinuesDecision(personId: string, termId: string, reason: string) {
  const [row] = await getDb()
    .insert(permanenceDecision)
    .values({
      personId,
      termId,
      proposed: "CONTINUES",
      decision: "CONTINUES",
      proposalReason: 0,
      reason,
    })
    .returning({ id: permanenceDecision.id });
  if (!row) throw new Error("seed continues decision");
  return row.id;
}

/** Resultado de un único push fallido y reintentable, con su recibo por dispositivo (ADR-144). */
export async function seedFailedPushReceipt(
  personId: string,
  subscriptionId: string,
  error: string,
) {
  const [sent] = await getDb()
    .insert(message)
    .values({
      personId,
      channel: "PUSH",
      subject: "Mensaje sintético",
      dedupeKey: `seed-push:${randomUUID()}`,
      status: "FAILED",
      provider: "webpush",
      error,
    })
    .returning({ id: message.id });
  if (!sent) throw new Error("seed failed push message");
  const [receipt] = await getDb()
    .insert(pushDelivery)
    .values({
      messageId: sent.id,
      subscriptionId,
      status: "FAILED",
      retryable: true,
      error,
    })
    .returning({ id: pushDelivery.id });
  if (!receipt) throw new Error("seed failed push receipt");
  return { messageId: sent.id, deliveryId: receipt.id };
}

/** Reconocimiento libre de ADMIN, sin publicación ni premio del catálogo. */
export async function seedOtherRecognition(
  personId: string,
  termId: string,
  title: string,
  grantedById: string,
) {
  const [row] = await getDb()
    .insert(recognition)
    .values({
      personId,
      termId,
      kind: "OTHER",
      title,
      grantedById,
    })
    .returning({ id: recognition.id });
  if (!row) throw new Error("seed other recognition");
  return row.id;
}

/** Asociación de etiquetas existentes; igual que addPersonTags, sin sus efectos de comando. */
export async function seedPersonTags(personId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  await getDb()
    .insert(personTag)
    .values([...new Set(tagIds)].map((tagId) => ({ personId, tagId })))
    .onConflictDoNothing();
}

/** Ajuste individual a una asamblea ordinaria, sin elección ni segunda vuelta. */
export async function seedAssemblyRequirement(
  personId: string,
  termId: string,
  adjustedReason: string,
) {
  const [row] = await getDb()
    .insert(assemblyRequirement)
    .values({
      personId,
      termId,
      requiredOrdinary: 1,
      requiresBoardElection: false,
      requiresRunoff: false,
      adjustedReason,
    })
    .returning({ id: assemblyRequirement.id });
  if (!row) throw new Error("seed assembly requirement");
  return row.id;
}

/** Tarea general abierta sobre una persona, creada y asignada por el mismo operador. */
export async function seedPersonTask(personId: string, title: string, operatorId: string) {
  const [row] = await getDb()
    .insert(task)
    .values({
      personId,
      title,
      kind: "GENERAL",
      status: "OPEN",
      createdById: operatorId,
      assigneeId: operatorId,
    })
    .returning({ id: task.id });
  if (!row) throw new Error("seed person task");
  return row.id;
}
