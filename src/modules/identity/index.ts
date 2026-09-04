// API pública del módulo identity.
export { SESSION_COOKIE } from "./cookie";
export { getActor, requireActor, requireAdminActor, requireAdminOrLeaderActor } from "./current";
export type { Actor, ActorPermission } from "./domain/actor";
export { issueCarnet, readCarnet } from "./domain/carnet";
export { type CarnetVerification, verifyCarnet } from "./domain/carnet-pure";
export { ForbiddenError, NotAuthenticatedError, StepUpRequiredError } from "./domain/errors";
export {
  assertAdmin,
  assertLeader,
  assertStepUp,
  hasPermission,
  hasRecentStepUp,
} from "./domain/guards";
export { requestOtp, verifyOtp, verifyStepUp } from "./domain/otp";
export {
  grantPermission,
  grantPermissionAs,
  listPermissions,
  revokePermission,
} from "./domain/permissions";
export { describeUserAgent, safeNextPath } from "./domain/pure";
export {
  destroySessionsFor,
  listPermissionsFor,
  listSessionsFor,
  resolveActor,
} from "./domain/session";
