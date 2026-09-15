import { type Actor, runCommand } from "@/db/tx";
import { getMembershipRef, listActiveMemberRefs, listAllCommittees } from "@/modules/people";
import { getConfig, requireConfig } from "@/modules/system";
import { closeTermPoints, findTermContaining, getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { type AdjustRequirementInput, adjustRequirement } from "./assemblies";
import type { CheckInDecision } from "./check-in-pure";
import {
  AlreadyCheckedIn,
  cancelOccasionCheckIns,
  checkInSelf,
  decideCheckIn,
  decideMany,
  findCheckIn,
  hostCheckIn,
  type SelfCheckInResult,
} from "./check-ins";
import { buildStanding, writeTermStanding } from "./closing";
import { adjustPoints, reverseEntry } from "./ledger";
import { loadGamificationSettings, resolveMemberContext } from "./member-context";
import {
  cancelOccasion,
  closeOccasion,
  countOpenOccasions,
  createOccasion,
  createOccasionSeries,
  getOccasionByPublicId,
  type OccasionContext,
  type OccasionInput,
  openOccasion,
  rotateSecret,
  type SeriesInput,
  setRotatingCode,
  updateOccasion,
} from "./occasions";
import { countPendingGamification } from "./rewards";

// Los comandos abren su transacción aquí (ADR-012). Membresía, nombres y config se resuelven antes;
// el guard público de terms usa ctx.tx para coordinar el cierre sin tomar otra conexión del pool.

/** El término que contiene la fecha de inicio (en Bogotá) y la ventana por defecto. */
export async function resolveOccasionContext(startsAt: Date): Promise<OccasionContext> {
  const term = await findTermContaining(todayKey(startsAt));
  if (!term) {
    throw new DomainError(t("T-675"), "startsAt");
  }
  const window = await requireConfig("checkin.defaultWindow");
  return { termId: term.id, window };
}

export async function createOccasionAs(
  actor: Actor,
  input: OccasionInput,
): Promise<{ id: string; publicId: string }> {
  const context = await resolveOccasionContext(input.startsAt);
  // Sin encuesta explícita, una actividad toma la encuesta por defecto de GH (ADR-038 regla 13).
  const surveyFormId =
    input.surveyFormId ??
    (input.kind === "ACTIVITY" ? await getConfig("survey.defaultFormId") : null);
  return runCommand(actor, (ctx) =>
    createOccasion(ctx, { ...input, surveyFormId: surveyFormId ?? undefined }, context),
  );
}

export async function updateOccasionAs(
  actor: Actor,
  id: string,
  input: OccasionInput,
): Promise<void> {
  const context = await resolveOccasionContext(input.startsAt);
  return runCommand(actor, (ctx) => updateOccasion(ctx, id, input, context));
}

export function openOccasionAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => openOccasion(ctx, id));
}

export function closeOccasionAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => closeOccasion(ctx, id));
}

/** Cancela la ocasión y, en la misma transacción, anula sus check-ins y revierte los créditos vivos. */
export async function cancelOccasionAs(
  actor: Actor,
  id: string,
  reason: string,
): Promise<{ cancelledCheckIns: number }> {
  const settings = await loadGamificationSettings();
  return runCommand(actor, async (ctx) => {
    const before = await cancelOccasion(ctx, id, reason);
    const cancelledCheckIns = await cancelOccasionCheckIns(
      ctx,
      before,
      reason.trim(),
      new Date(),
      settings,
    );
    return { cancelledCheckIns };
  });
}

/** Check-in propio: resuelve ocasión y membresía afuera; el cierre se valida dentro. */
export async function checkInSelfAs(
  actor: Actor & { personId: string },
  input: { publicId: string; code?: string | null; boosterId?: string | null; now?: Date },
): Promise<SelfCheckInResult> {
  const row = await getOccasionByPublicId(input.publicId);
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const [membership, member, settings] = await Promise.all([
    getMembershipRef(actor.personId),
    resolveMemberContext(actor.personId, row.termId),
    loadGamificationSettings(),
  ]);
  try {
    return await runCommand(actor, (ctx) =>
      checkInSelf(
        ctx,
        {
          occasionId: row.id,
          personId: actor.personId,
          code: input.code,
          boosterId: input.boosterId,
          now: input.now,
        },
        { membership, member, settings },
      ),
    );
  } catch (error) {
    if (error instanceof AlreadyCheckedIn) {
      const existing = await findCheckIn(error.occasionId, error.personId);
      if (existing) {
        return { ok: false, reason: "ALREADY", existing };
      }
    }
    throw error;
  }
}

/** Alta por el organizador (anfitrión o admin): la autorización la decide la acción de la página. */
export async function hostCheckInAs(
  actor: Actor & { personId: string },
  input: { occasionId: string; personId: string; personName: string; source: "HOST" | "ADMIN" },
): Promise<{ checkInId: string; points: number }> {
  const membership = await getMembershipRef(input.personId);
  const settings = await loadGamificationSettings();
  try {
    return await runCommand(actor, (ctx) => hostCheckIn(ctx, input, { membership, settings }));
  } catch (error) {
    if (error instanceof AlreadyCheckedIn) {
      throw new DomainError(t("T-601", { nombre: input.personName }));
    }
    throw error;
  }
}

export async function decideCheckInAs(
  actor: Actor & { personId: string },
  input: { checkInId: string; decision: CheckInDecision; reason?: string | null },
): Promise<void> {
  const settings = await loadGamificationSettings();
  return runCommand(actor, (ctx) => decideCheckIn(ctx, input, { settings }));
}

export async function decideManyAs(
  actor: Actor & { personId: string },
  checkInIds: string[],
  decision: CheckInDecision,
  reason?: string | null,
): Promise<number> {
  const settings = await loadGamificationSettings();
  return runCommand(actor, (ctx) => decideMany(ctx, checkInIds, decision, reason, { settings }));
}

export function setRotatingCodeAs(actor: Actor, id: string, enabled: boolean): Promise<void> {
  return runCommand(actor, (ctx) => setRotatingCode(ctx, id, enabled));
}

export function rotateSecretAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => rotateSecret(ctx, id));
}

export async function adjustPointsAs(
  actor: Actor & { personId: string },
  input: { personId: string; termId: string; points: number; reason: string },
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => adjustPoints(ctx, input));
}

export async function reverseEntryAs(
  actor: Actor & { personId: string },
  entryId: string,
  reason: string,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => reverseEntry(ctx, entryId, reason));
}

export function adjustRequirementAs(
  actor: Actor & { personId: string },
  input: AdjustRequirementInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => adjustRequirement(ctx, input));
}

/**
 * Precarga solo nombres y membresías. Dentro, el bloqueo exclusivo espera a los escritores y
 * conserva juntos el sello de cierre, los totales definitivos, el standing y su evento.
 */
export async function closeTermPointsAs(
  actor: Actor & { personId: string },
  termId: string,
): Promise<{ id: string }> {
  const [members, committees] = await Promise.all([listActiveMemberRefs(), listAllCommittees()]);
  return runCommand(actor, async (ctx) => {
    await closeTermPoints(ctx, termId);
    const openOccasions = await countOpenOccasions(termId, ctx.tx);
    if (openOccasions > 0) {
      throw new DomainError(t("T-646", { n: openOccasions }));
    }
    // ADR-067 regla 13: entregas de retos pendientes y premios reservados bloquean el cierre.
    const pending = await countPendingGamification(termId, ctx.tx);
    if (pending.pendingParticipations > 0 || pending.reservedRewards > 0) {
      throw new DomainError(
        t("T-2562", { n: pending.pendingParticipations, m: pending.reservedRewards }),
      );
    }
    const standing = await buildStanding(termId, { exec: ctx.tx, members, committees });
    return writeTermStanding(ctx, termId, standing, { openOccasions });
  });
}

/** Serie semanal de reuniones: el término sale de la primera fecha; cada reunión nace abierta y sin puntos. */
export async function createOccasionSeriesAs(
  actor: Actor & { personId: string },
  input: SeriesInput,
): Promise<{ created: number; skipped: number; lastStartsAt: Date | null }> {
  const context = await resolveOccasionContext(input.firstStartsAt);
  const term = await getTerm(context.termId);
  if (!term) {
    throw new DomainError(t("T-675"), "firstStartsAt");
  }
  if (term.pointsClosedAt) {
    throw new DomainError(t("T-579"));
  }
  return runCommand(actor, (ctx) =>
    createOccasionSeries(ctx, input, { ...context, termEndsOn: term.endsOn }),
  );
}
