import type { Actor } from "@/modules/identity";

export function walletActor(personId: string): Actor {
  return {
    personId,
    sessionId: "sesion-sintetica",
    email: "wallet-sintetica@eafit.edu.co",
    name: "Persona",
    firstName: "Persona",
    membershipStatus: "ACTIVE",
    permissions: [],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin: false,
  };
}
