import { type Actor, runCommand } from "@/db/tx";
import { findTermContaining, getCurrentTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import type { BoosterKind } from "../gamification-types";
import {
  type BadgeDelta,
  createSpecialBadge,
  markSeen,
  recomputeBadgesFor,
  type SpecialBadgeInput,
  setFeatured,
} from "./badges";
import {
  type BoosterRow,
  type BoosterTarget,
  type CampaignInput,
  cancelCampaign,
  createCampaigns,
  grantBoosterManually,
  revokeBooster,
  setBoosterTarget,
} from "./boosters";
import {
  annulParticipation,
  reviewParticipation,
  type SubmitResult,
  submitEvidence,
  submitTrivia,
} from "./challenge-participation";
import {
  activeCampaignFor,
  type ChallengeInput,
  cancelChallenge,
  createChallenge,
  duplicateChallenge,
  findChallenge,
  findTargetedBooster,
  publishChallenge,
  updateChallenge,
} from "./challenges";
import { verifyEvidenceObjects } from "./evidence";
import { loadGamificationSettings, resolveMemberContext } from "./member-context";
import { getOccasion } from "./occasions";

// Comandos de la gamificación (ADR-012): el término, la membresía y los objetos ya subidos se
// resuelven antes de abrir la transacción; el booster apuntado y la campaña vigente se leen
// dentro de la tx para que la reserva del premio sea atómica con su consumo.

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
  return runCommand(actor, async (ctx) => {
    const now = input.now ?? new Date();
    const [booster, campaign] = row
      ? await Promise.all([
          findTargetedBooster(ctx.tx, actor.personId, { challengeId: row.id }, now),
          activeCampaignFor(ctx.tx, { challengeId: row.id }, now),
        ])
      : [null, null];
    return submitTrivia(
      ctx,
      { ...input, personId: actor.personId, now },
      { member, settings, booster, campaign },
    );
  });
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
  return runCommand(actor, async (ctx) => {
    const now = input.now ?? new Date();
    const [booster, campaign] = row
      ? await Promise.all([
          findTargetedBooster(ctx.tx, actor.personId, { challengeId: row.id }, now),
          activeCampaignFor(ctx.tx, { challengeId: row.id }, now),
        ])
      : [null, null];
    return submitEvidence(
      ctx,
      { ...input, personId: actor.personId, files, now },
      { member, settings, booster, campaign },
    );
  });
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

// Boosters y campañas (ADR-067 reglas 6 a 9): la membresía se resuelve en el término del objetivo
// porque el público del reto compara `firstTermId` y los comités vigentes son por término.

export async function setBoosterTargetAs(
  actor: Actor & { personId: string },
  input: { boosterId: string; target: BoosterTarget | null; now?: Date },
): Promise<BoosterRow> {
  const settings = await loadGamificationSettings();
  let termId: string | null = null;
  if (input.target?.challengeId) {
    termId = (await findChallenge(input.target.challengeId))?.termId ?? null;
  } else if (input.target?.occasionId) {
    termId = (await getOccasion(input.target.occasionId))?.termId ?? null;
  }
  if (!termId) {
    termId = (await getCurrentTerm())?.id ?? null;
  }
  const member = termId ? await resolveMemberContext(actor.personId, termId) : null;
  return runCommand(actor, (ctx) =>
    setBoosterTarget(ctx, { personId: actor.personId, ...input }, { member, settings }),
  );
}

export function grantBoosterAs(
  actor: Actor & { personId: string },
  input: { personId: string; termId: string; kind: BoosterKind; reason: string },
): Promise<BoosterRow> {
  return runCommand(actor, (ctx) => grantBoosterManually(ctx, input));
}

export function revokeBoosterAs(
  actor: Actor & { personId: string },
  input: { boosterId: string; reason: string },
): Promise<void> {
  return runCommand(actor, (ctx) => revokeBooster(ctx, input));
}

/** Una campaña por objetivo; el término sale de la fecha de inicio en día civil de Colombia. */
export async function createCampaignsAs(
  actor: Actor & { personId: string },
  input: CampaignInput,
): Promise<{ ids: string[] }> {
  const term = await findTermContaining(todayKey(input.startsAt));
  if (!term) {
    throw new DomainError(t("T-675"), "startsAt");
  }
  return runCommand(actor, (ctx) => createCampaigns(ctx, input, { termId: term.id }));
}

export function cancelCampaignAs(actor: Actor & { personId: string }, id: string): Promise<void> {
  return runCommand(actor, (ctx) => cancelCampaign(ctx, id));
}

// Insignias (ADR-067 reglas 9, 10 y 15): la edición especial toma el término de su objetivo;
// destacar y marcar vistas son comandos del propio miembro; el recompute manual es de GH.

/** Edición especial vinculada a una ocasión o a un reto: el término es el del objetivo. */
export async function createSpecialBadgeAs(
  actor: Actor & { personId: string },
  input: SpecialBadgeInput,
): Promise<{ id: string }> {
  let termId: string | null = null;
  if (input.specialOccasionId) {
    termId = (await getOccasion(input.specialOccasionId))?.termId ?? null;
  } else if (input.specialChallengeId) {
    termId = (await findChallenge(input.specialChallengeId))?.termId ?? null;
  }
  if (!termId) {
    throw new DomainError(t("T-675"));
  }
  return runCommand(actor, (ctx) => createSpecialBadge(ctx, input, { termId }));
}

export function setFeaturedAs(
  actor: Actor & { personId: string },
  input: { achievementId: string; featured: boolean },
): Promise<void> {
  return runCommand(actor, (ctx) => setFeatured(ctx, { personId: actor.personId, ...input }));
}

export function markSeenAs(
  actor: Actor & { personId: string },
  achievementIds: string[],
): Promise<void> {
  return runCommand(actor, (ctx) => markSeen(ctx, actor.personId, achievementIds));
}

/** Recompute manual desde el panel de GH (la vía normal son los handlers del outbox). */
export function recomputeBadgesForAs(
  actor: Actor & { personId: string },
  personId: string,
): Promise<BadgeDelta> {
  return recomputeBadgesFor(personId, { historical: false, actor });
}
