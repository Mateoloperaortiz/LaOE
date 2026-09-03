// API pública del módulo identity.
export { SESSION_COOKIE } from "./cookie";
export { getActor, requireActor, requireAdminActor } from "./current";
export type { Actor, ActorPermission } from "./domain/actor";
export { ForbiddenError, NotAuthenticatedError, StepUpRequiredError } from "./domain/errors";
export {
  assertAdmin,
  assertLeader,
  assertStepUp,
  hasPermission,
  hasRecentStepUp,
} from "./domain/guards";
export { requestOtp, verifyOtp, verifyStepUp } from "./domain/otp";
export { grantPermission, listPermissions, revokePermission } from "./domain/permissions";
export { describeUserAgent, safeNextPath } from "./domain/pure";
export { destroySessionsFor, listSessionsFor, resolveActor } from "./domain/session";
