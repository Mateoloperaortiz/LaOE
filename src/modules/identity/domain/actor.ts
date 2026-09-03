import type { MembershipStatus } from "@/modules/people";

export interface ActorPermission {
  code: "ADMIN" | "COMMITTEE_LEADER" | "BOARD";
  committeeId: string | null;
}

/** La persona autenticada con sus permisos, validada en servidor (ADR-011). */
export interface Actor {
  personId: string;
  sessionId: string;
  email: string;
  name: string;
  firstName: string;
  membershipStatus: MembershipStatus;
  permissions: ActorPermission[];
  otpVerifiedAt: Date;
  sessionLastSeenAt: Date;
  sessionRemembered: boolean;
  isAdmin: boolean;
}
