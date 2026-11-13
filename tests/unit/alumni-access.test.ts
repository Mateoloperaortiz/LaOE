import { describe, expect, it } from "vitest";
import { alumniMayOpen } from "@/modules/identity/domain/alumni-routes";
import { signInAccess } from "@/modules/people";

// Egresados con acceso (ADR-184): quién entra y a qué rutas de Mi OE.

describe("signInAccess", () => {
  it("entra como miembro quien está activo, en licencia u honorario", () => {
    for (const status of ["ACTIVE", "ON_LEAVE", "HONORARY"] as const) {
      expect(signInAccess({ status, endReason: null, anonymizedAt: null })).toBe("MEMBER");
    }
  });

  it("entra como egresado solo quien salió por grado y no fue anonimizado", () => {
    expect(signInAccess({ status: "INACTIVE", endReason: "GRADUATION", anonymizedAt: null })).toBe(
      "ALUMNI",
    );
    expect(
      signInAccess({ status: "INACTIVE", endReason: "GRADUATION", anonymizedAt: new Date() }),
    ).toBeNull();
    for (const endReason of [
      "RESIGNATION",
      "PERMANENCE",
      "EXPULSION",
      "STUDENT_STATUS_LOST",
      "OTHER",
    ]) {
      expect(signInAccess({ status: "INACTIVE", endReason, anonymizedAt: null })).toBeNull();
    }
  });
});

describe("alumniMayOpen", () => {
  it("abre la red y lo suyo, con rutas más hondas y con consulta", () => {
    for (const path of [
      "/app/egresados",
      "/app/oportunidades/abc123",
      "/app/padrinos",
      "/app/yo/trayectoria",
      "/app/avisos?filtro=todos",
      "/app/ajustes#sesiones",
    ]) {
      expect(alumniMayOpen(path)).toBe(true);
    }
  });

  it("no abre lo de quien participa ni rutas que solo empiezan igual", () => {
    for (const path of [
      "/app",
      "/app/agenda",
      "/app/yo",
      "/app/yo/empalme",
      "/admin",
      "/app/egresadosx",
    ]) {
      expect(alumniMayOpen(path)).toBe(false);
    }
  });
});
