import type { Actor, ActorPermission } from "./actor";
import { ForbiddenError, StepUpRequiredError } from "./errors";
import { STEP_UP_WINDOW_MS } from "./pure";

// Guards puros: cada comando sensible empieza por uno de estos (ADR-011).

export function hasPermission(
  actor: Actor,
  code: ActorPermission["code"],
  committeeId?: string,
): boolean {
  return actor.permissions.some(
    (permission) =>
      permission.code === code &&
      (committeeId === undefined || permission.committeeId === committeeId),
  );
}

export function assertAdmin(actor: Actor): void {
  if (!actor.isAdmin) {
    throw new ForbiddenError("Solo ADMIN");
  }
}

/** Líder del comité o ADMIN. */
export function assertLeader(actor: Actor, committeeId: string): void {
  if (!actor.isAdmin && !hasPermission(actor, "COMMITTEE_LEADER", committeeId)) {
    throw new ForbiddenError("Solo el líder del comité");
  }
}

export function hasRecentStepUp(actor: Actor, now = new Date()): boolean {
  return now.getTime() - actor.otpVerifiedAt.getTime() < STEP_UP_WINDOW_MS;
}

export function assertStepUp(actor: Actor, now = new Date()): void {
  if (!hasRecentStepUp(actor, now)) {
    throw new StepUpRequiredError();
  }
}
