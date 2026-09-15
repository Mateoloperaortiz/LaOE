"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/modules/identity";
import {
  ChallengeAlreadySubmitted,
  type ChallengeSubmitReply,
  EVIDENCE_KEY_PATTERN,
  type MemberChallengeStatus,
  type SubmitResult,
  submitEvidenceAs,
  submitTriviaAs,
} from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

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
    const result = await submitTriviaAs(
      { personId: actor.personId, ip: await clientIp() },
      parsed.data,
    );
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
    const result = await submitEvidenceAs(
      { personId: actor.personId, ip: await clientIp() },
      parsed.data,
    );
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
