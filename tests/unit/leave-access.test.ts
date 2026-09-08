import { describe, expect, it } from "vitest";
import type { Actor } from "@/modules/identity/domain/actor";
import { ForbiddenError } from "@/modules/identity/domain/errors";
import {
  assertAdmin,
  assertBoard,
  assertLeader,
  hasPermission,
} from "@/modules/identity/domain/guards";
import { canParticipate } from "@/modules/people/domain/access-pure";

const actor: Actor = {
  personId: "persona-sintetica",
  sessionId: "sesion-sintetica",
  email: "licencia@eafit.edu.co",
  name: "Persona",
  firstName: "Persona",
  membershipStatus: "ON_LEAVE",
  permissions: [
    { code: "ADMIN", committeeId: null },
    { code: "BOARD", committeeId: null },
    { code: "COMMITTEE_LEADER", committeeId: "comite" },
  ],
  otpVerifiedAt: new Date(),
  sessionLastSeenAt: new Date(),
  sessionRemembered: false,
  isAdmin: true,
};

describe("licencia con permisos almacenados", () => {
  it("ningún permiso habilita operaciones en un actor de consulta", () => {
    expect(hasPermission(actor, "BOARD")).toBe(false);
    expect(() => assertAdmin(actor)).toThrow(ForbiddenError);
    expect(() => assertLeader(actor, "comite")).toThrow(ForbiddenError);
    expect(() => assertBoard(actor)).toThrow(ForbiddenError);
  });
  it("conserva participación y permisos para activos y honorarios", () => {
    for (const membershipStatus of ["ACTIVE", "HONORARY"] as const) {
      expect(canParticipate(membershipStatus)).toBe(true);
      expect(() => assertAdmin({ ...actor, membershipStatus })).not.toThrow();
    }
    for (const status of ["ON_LEAVE", "INACTIVE", null, undefined] as const)
      expect(canParticipate(status)).toBe(false);
  });
});
