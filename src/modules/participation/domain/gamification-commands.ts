import { type Actor, runCommand } from "@/db/tx";
import { findTermContaining } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import {
  annulParticipation,
  reviewParticipation,
  type SubmitResult,
  submitEvidence,
  submitTrivia,
} from "./challenge-participation";
import {
  type ChallengeInput,
  cancelChallenge,
  createChallenge,
  duplicateChallenge,
  findChallenge,
  publishChallenge,
  updateChallenge,
} from "./challenges";
import { verifyEvidenceObjects } from "./evidence";
import { loadGamificationSettings, resolveMemberContext } from "./member-context";

// Comandos de la gamificación (ADR-012): el término, la membresía y los objetos ya subidos se
// resuelven antes de abrir la transacción. En G-T2 aún no hay campañas ni boosters dirigidos:
// el contexto los pasa en null y `reviewParticipation` los re-resuelve dentro de la tx.

export async function createChallengeAs(
  actor: Actor & { personId: string },
  input: ChallengeInput,
): Promise<{ id: string }> {
  const settings = await loadGamificationSettings();
  const term = await findTermContaining(todayKey(input.opensAt));
  if (!term) {
    throw new DomainError(t("T-675"), "opensAt");
  }
  return runCommand(actor, (ctx) =>
    createChallenge(ctx, input, {
      termId: term.id,
      defaultPassPercent: settings.defaults.passPercent,
    }),
  );
}

export async function updateChallengeAs(
  actor: Actor & { personId: string },
  id: string,
  input: ChallengeInput,
): Promise<void> {
  const settings = await loadGamificationSettings();
  const row = await findChallenge(id);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return runCommand(actor, (ctx) =>
    updateChallenge(ctx, id, input, {
      termId: row.termId,
      defaultPassPercent: settings.defaults.passPercent,
    }),
  );
}

export function publishChallengeAs(actor: Actor & { personId: string }, id: string): Promise<void> {
  return runCommand(actor, (ctx) => publishChallenge(ctx, id));
}

export async function cancelChallengeAs(
  actor: Actor & { personId: string },
  id: string,
  reason: string,
): Promise<{ released: number; granted: number }> {
  const settings = await loadGamificationSettings();
  return runCommand(actor, (ctx) => cancelChallenge(ctx, id, reason, { caps: settings.caps }));
}

export function duplicateChallengeAs(
  actor: Actor & { personId: string },
  id: string,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => duplicateChallenge(ctx, id));
}

export interface TriviaSubmitInput {
  challengeId: string;
  requestId: string;
  answers: number[];
  now?: Date | undefined;
}

export async function submitTriviaAs(
  actor: Actor & { personId: string },
  input: TriviaSubmitInput,
): Promise<SubmitResult> {
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    return { ok: false, reason: "DISABLED" };
  }
  const row = await findChallenge(input.challengeId);
  const member = row ? await resolveMemberContext(actor.personId, row.termId) : null;
  return runCommand(actor, (ctx) =>
    submitTrivia(
      ctx,
      { ...input, personId: actor.personId },
      { member, settings, booster: null, campaign: null },
    ),
  );
}

export interface EvidenceSubmitInput {
  challengeId: string;
  requestId: string;
  text: string;
  keys: string[];
  now?: Date | undefined;
}

export async function submitEvidenceAs(
  actor: Actor & { personId: string },
  input: EvidenceSubmitInput,
): Promise<SubmitResult> {
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    return { ok: false, reason: "DISABLED" };
  }
  const row = await findChallenge(input.challengeId);
  const member = row ? await resolveMemberContext(actor.personId, row.termId) : null;
  // HEAD de cada objeto antes de la transacción: inválidos se rechazan (y los propios se borran).
  const files = await verifyEvidenceObjects(actor.personId, input.keys);
  return runCommand(actor, (ctx) =>
    submitEvidence(
      ctx,
      { ...input, personId: actor.personId, files },
      { member, settings, booster: null, campaign: null },
    ),
  );
}

export interface ReviewInput {
  participationId: string;
  decision: "APPROVE" | "REJECT";
  reason?: string | null | undefined;
  now?: Date | undefined;
}

export async function reviewParticipationAs(
  actor: Actor & { personId: string },
  input: ReviewInput,
): Promise<void> {
  const settings = await loadGamificationSettings();
  return runCommand(actor, (ctx) => reviewParticipation(ctx, input, { settings }));
}

export function annulParticipationAs(
  actor: Actor & { personId: string },
  participationId: string,
  reason: string,
): Promise<void> {
  return runCommand(actor, (ctx) => annulParticipation(ctx, participationId, reason));
}
