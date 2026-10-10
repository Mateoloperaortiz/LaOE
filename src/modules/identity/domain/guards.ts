import type { Actor, ActorPermission } from "./actor";
import { ForbiddenError, StepUpRequiredError } from "./errors";
import { STEP_UP_WINDOW_MS } from "./pure";

// Guards puros (ADR-011, enmendada por ADR-119 regla 22). La capacidad del actor la comprueba quien
// recibe el request: la action o la ruta, con `requireAdminActor` o con un guard de `src/app/_authz`,
// que se arman con estos. El comando de dominio comprueba el alcance y no vuelve a llamar un guard;
// el único que llama a uno es `rotateCarnetTokenAs`, con `assertAdmin` para el carnet ajeno.

/** Los permisos guardados no habilitan operaciones mientras la persona está en licencia. */
export function canOperate(actor: Actor): boolean {
  return actor.membershipStatus === "ACTIVE" || actor.membershipStatus === "HONORARY";
}

export function hasPermission(
  actor: Actor,
  code: ActorPermission["code"],
  committeeId?: string,
): boolean {
  return (
    canOperate(actor) &&
    actor.permissions.some(
      (permission) =>
        permission.code === code &&
        (committeeId === undefined || permission.committeeId === committeeId),
    )
  );
}

export function assertAdmin(actor: Actor): void {
  if (!canOperate(actor) || !actor.isAdmin) {
    throw new ForbiddenError("Solo ADMIN");
  }
}

/** Líder del comité o ADMIN. */
export function assertLeader(actor: Actor, committeeId: string): void {
  if (
    !canOperate(actor) ||
    (!actor.isAdmin && !hasPermission(actor, "COMMITTEE_LEADER", committeeId))
  ) {
    throw new ForbiddenError("Solo el líder del comité");
  }
}

/** Junta o ADMIN (ADR-036 regla 12): agregados sin nombres. */
export function assertBoard(actor: Actor): void {
  if (!canOperate(actor) || (!actor.isAdmin && !hasPermission(actor, "BOARD"))) {
    throw new ForbiddenError("Solo la junta");
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
