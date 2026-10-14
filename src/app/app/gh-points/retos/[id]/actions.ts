"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import {
  ChallengeAlreadySubmitted,
  type ChallengeSubmitReply,
  discardEvidenceUploadAs,
  EVIDENCE_KEY_PATTERN,
  type MemberChallengeStatus,
  type SubmitResult,
  submitEvidenceAs,
  submitTriviaAs,
} from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

// Entregas del miembro (ADR-067 reglas 4 y 5): validación zod, sesión propia y respuesta
// serializable sin filas de la base. El requestId hace el replay idempotente.

const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/);

const triviaSchema = z.object({
  challengeId: idSchema,
  requestId: z.string().uuid(),
  answers: z.array(z.number().int().min(0).max(5)).min(1).max(5),
});

const evidenceSchema = z.object({
  challengeId: idSchema,
  requestId: z.string().uuid(),
  text: z.string().max(4_000),
  keys: z.array(z.string().regex(EVIDENCE_KEY_PATTERN)).max(3),
});

const discardSchema = z.object({ key: z.string().regex(EVIDENCE_KEY_PATTERN) });

const STATUS: Record<string, MemberChallengeStatus> = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
};

function toReply(result: SubmitResult): ChallengeSubmitReply {
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  const reply: ChallengeSubmitReply = {
    ok: true,
    status: STATUS[result.participation.status] ?? "PENDING",
    reason: result.participation.reason,
  };
  if (result.participation.score !== null) {
    reply.score = result.participation.score;
  }
  if (result.participation.answers) {
    reply.total = result.participation.answers.length;
  }
  if (result.reward) {
    reply.points = result.reward.baseGranted + result.reward.extraPoints;
  }
  return reply;
}

function revalidate(challengeId: string): void {
  revalidatePath("/app");
  revalidatePath("/app/gh-points");
  revalidatePath("/app/gh-points/retos");
  revalidatePath(`/app/gh-points/retos/${challengeId}`);
}

export async function submitTriviaAction(input: unknown): Promise<ChallengeSubmitReply> {
  const actor = await requireActor("/app/gh-points/retos");
  const parsed = triviaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  try {
    const result = await submitTriviaAs(await actorContext(actor), parsed.data);
    if (result.ok) {
      revalidate(parsed.data.challengeId);
    }
    return toReply(result);
  } catch (error) {
    if (error instanceof ChallengeAlreadySubmitted) {
      return { ok: false, reason: "ALREADY" };
    }
    if (error instanceof DomainError) {
      return { ok: false, reason: "INVALID_INPUT" };
    }
    throw error;
  }
}

export async function submitEvidenceAction(input: unknown): Promise<ChallengeSubmitReply> {
  const actor = await requireActor("/app/gh-points/retos");
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "INVALID_INPUT" };
  }
  try {
    const result = await submitEvidenceAs(await actorContext(actor), parsed.data);
    if (result.ok) {
      revalidate(parsed.data.challengeId);
    }
    return toReply(result);
  } catch (error) {
    if (error instanceof ChallengeAlreadySubmitted) {
      return { ok: false, reason: "ALREADY" };
    }
    if (error instanceof DomainError) {
      return { ok: false, reason: "INVALID_INPUT" };
    }
    throw error;
  }
}

/**
 * La imagen que el miembro quita de la lista antes de entregar se borra del bucket (ADR-122 regla
 * 20). No responde nada que la pantalla pinte: la imagen ya salió de la lista. Que la clave sea suya
 * y que ninguna entrega la use lo comprueba el comando; lo que rechaza queda donde estaba.
 */
export async function discardEvidenceUploadAction(input: unknown): Promise<void> {
  const actor = await requireActor("/app/gh-points/retos");
  const parsed = discardSchema.safeParse(input);
  if (!parsed.success) {
    return;
  }
  try {
    await discardEvidenceUploadAs(await actorContext(actor), parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      return;
    }
    throw error;
  }
}
