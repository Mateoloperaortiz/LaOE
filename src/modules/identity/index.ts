// API pública del módulo identity.
export { SESSION_COOKIE } from "./cookie";
export {
  getActor,
  requireActor,
  requireAdminActor,
  requireBoardActor,
} from "./current";
export {
  type AccessGrantKind,
  type AccessGrantReading,
  consumeAccessGrant,
  type IssuedAccessGrant,
  issueAccessGrantAs,
  resolveAccessGrant,
} from "./domain/access-grant";
export type { Actor, ActorPermission } from "./domain/actor";
export {
  CALENDAR_TOKEN,
  getOrCreateCalendarToken,
  resolveCalendarToken,
  rotateCalendarTokenAs,
} from "./domain/calendar-token";
export { type CarnetReading, issueCarnet, readCarnet } from "./domain/carnet";
export { type CarnetVerification, verifyCarnet } from "./domain/carnet-pure";
export {
  CARNET_TOKEN,
  type CarnetCredential,
  type CarnetMetadata,
  deleteCarnetTokenFor,
  getCarnetCredential,
  getCarnetMetadata,
  getOrCreateCarnetCredential,
  getOrCreateCarnetToken,
  resolveCarnetToken,
  rotateCarnetTokenAs,
} from "./domain/carnet-token";
export { ForbiddenError, NotAuthenticatedError, StepUpRequiredError } from "./domain/errors";
export {
  assertAdmin,
  assertBoard,
  assertLeader,
  assertStepUp,
  canOperate,
  hasPermission,
  hasRecentStepUp,
} from "./domain/guards";
export { requestOtp, verifyOtp, verifyStepUp } from "./domain/otp";
export {
  findPasswordHash,
  hasPassword,
  listPeopleWithPassword,
  setOwnPassword,
  signInWithPassword,
  verifyStepUpPassword,
} from "./domain/password";
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
