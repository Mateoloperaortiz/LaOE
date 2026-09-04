import { type Actor, runCommand } from "@/db/tx";
import { getMembershipRef } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermContaining, getTerm, listAllTerms } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
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
import { adjustPoints, reverseEntry } from "./ledger";
import {
  cancelOccasion,
  closeOccasion,
  createOccasion,
  getOccasion,
  getOccasionByPublicId,
  type OccasionContext,
  type OccasionInput,
  openOccasion,
  rotateSecret,
  setRotatingCode,
  updateOccasion,
} from "./occasions";

// Los comandos abren su transacción aquí (ADR-012). Las lecturas cruzadas (término, config) se
// resuelven ANTES de runCommand: dentro de la transacción no se lee con getDb() para no agotar el
// pool bajo cientos de check-ins simultáneos (ADR-035 regla 1).

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
  return runCommand(actor, (ctx) => createOccasion(ctx, input, context));
}

export async function updateOccasionAs(
  actor: Actor,
  id: string,
  input: OccasionInput,
): Promise<void> {
  const context = await resolveOccasionContext(input.startsAt);
  return runCommand(actor, (ctx) => updateOccasion(ctx, id, input, context));
}

export async function openOccasionAs(actor: Actor, id: string): Promise<void> {
  const current = await getOccasion(id);
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  const term = await getTerm(current.termId);
  const termPointsClosed = term?.pointsClosedAt !== null && term?.pointsClosedAt !== undefined;
  return runCommand(actor, (ctx) => openOccasion(ctx, id, { termPointsClosed }));
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
  return runCommand(actor, async (ctx) => {
    const before = await cancelOccasion(ctx, id, reason);
    const cancelledCheckIns = await cancelOccasionCheckIns(ctx, before, reason.trim());
    return { cancelledCheckIns };
  });
}

async function termPointsClosed(termId: string): Promise<boolean> {
  const term = await getTerm(termId);
  return term?.pointsClosedAt !== null && term?.pointsClosedAt !== undefined;
}

/** Check-in propio: resuelve ocasión, membresía y término afuera; adentro solo tablas propias. */
export async function checkInSelfAs(
  actor: Actor & { personId: string },
  input: { publicId: string; code?: string | null; now?: Date },
): Promise<SelfCheckInResult> {
  const row = await getOccasionByPublicId(input.publicId);
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  const [membership, closed] = await Promise.all([
    getMembershipRef(actor.personId),
    termPointsClosed(row.termId),
  ]);
  try {
    return await runCommand(actor, (ctx) =>
      checkInSelf(
        ctx,
        { occasionId: row.id, personId: actor.personId, code: input.code, now: input.now },
        { membership, termPointsClosed: closed },
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
  try {
    return await runCommand(actor, (ctx) => hostCheckIn(ctx, input, { membership }));
  } catch (error) {
    if (error instanceof AlreadyCheckedIn) {
      throw new DomainError(t("T-601", { nombre: input.personName }));
    }
    throw error;
  }
}

export function decideCheckInAs(
  actor: Actor & { personId: string },
  input: { checkInId: string; decision: CheckInDecision; reason?: string | null },
): Promise<void> {
  return runCommand(actor, (ctx) => decideCheckIn(ctx, input));
}

export function decideManyAs(
  actor: Actor & { personId: string },
  checkInIds: string[],
  decision: CheckInDecision,
  reason?: string | null,
): Promise<number> {
  return runCommand(actor, (ctx) => decideMany(ctx, checkInIds, decision, reason));
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
  const closed = await termPointsClosed(input.termId);
  return runCommand(actor, (ctx) => adjustPoints(ctx, input, { termPointsClosed: closed }));
}

export async function reverseEntryAs(
  actor: Actor & { personId: string },
  entryId: string,
  reason: string,
): Promise<{ id: string }> {
  const terms = await listAllTerms();
  const closedTerms = new Set(
    terms.filter((term) => term.pointsClosedAt !== null).map((term) => term.id),
  );
  return runCommand(actor, (ctx) =>
    reverseEntry(ctx, entryId, reason, { termPointsClosed: (termId) => closedTerms.has(termId) }),
  );
}
