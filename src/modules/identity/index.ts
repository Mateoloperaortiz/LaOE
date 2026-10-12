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
  consumeAccessGrant,
  issueAccessGrantAs,
  resolveAccessGrant,
} from "./domain/access-grant";
export type { Actor, ActorPermission } from "./domain/actor";
export {
  getOrCreateCalendarToken,
  resolveCalendarToken,
  rotateCalendarTokenAs,
} from "./domain/calendar-token";
export { issueCarnet, readCarnet } from "./domain/carnet";
export {
  type CarnetMetadata,
  getCarnetCredential,
  getCarnetMetadata,
  getOrCreateCarnetCredential,
  getOrCreateCarnetToken,
  rotateCarnetTokenAs,
} from "./domain/carnet-token";
export { ForbiddenError } from "./domain/errors";
export {
  assertAdmin,
  assertBoard,
  canOperate,
  hasPermission,
  hasRecentStepUp,
} from "./domain/guards";
export { requestOtp, verifyOtp } from "./domain/otp";
export {
  findPasswordHash,
  hasPassword,
  listPeopleWithPassword,
  setOwnPassword,
  signInWithPassword,
} from "./domain/password";
export {
  grantPermission,
  grantPermissionAs,
  listPermissions,
  revokePermission,
} from "./domain/permissions";
export { describeUserAgent, safeNextPath } from "./domain/pure";
export { listPermissionsFor, listSessionsFor, resolveActor, signOut } from "./domain/session";
