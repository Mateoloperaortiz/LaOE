import { describe, expect, it } from "vitest";
import {
  checkRolesChange,
  committeeRolesLabel,
  type DirectionActor,
  type RoleState,
  rolesChangeMessage,
  vacatedRequiredRole,
} from "@/modules/people/domain/committee-direction-pure";

// Reglas puras de la dirección del comité (ADR-058): etiquetas de varios cargos y guardas de cambio.

const general: RoleState = {
  roleCode: "GENERAL",
  roleLabel: "General",
  coDirector: false,
  isLeadership: true,
  required: true,
};
const financiero: RoleState = {
  roleCode: "FINANCIERO",
  roleLabel: "Financiero",
  coDirector: false,
  isLeadership: true,
  required: true,
};
const logistica: RoleState = {
  roleCode: "LOGISTICA",
  roleLabel: "Logística",
  coDirector: false,
  isLeadership: true,
  required: false,
};
const coGeneral: RoleState = { ...general, coDirector: true };

const admin: DirectionActor = { isAdmin: true, capabilities: new Set(["ROSTER", "DIRECTION"]) };
const generalDelComite: DirectionActor = {
  isAdmin: false,
  capabilities: new Set(["ROSTER", "DIRECTION", "PERMANENCE"]),
};
const gh: DirectionActor = { isAdmin: false, capabilities: new Set(["ROSTER", "PERMANENCE"]) };

describe("etiqueta de los cargos", () => {
  it("compone uno, dos o varios cargos y marca la codirección", () => {
    expect(committeeRolesLabel([], "Miembro")).toBe("Miembro");
    expect(committeeRolesLabel([general], "Miembro")).toBe("General");
    expect(committeeRolesLabel([general, logistica], "Miembro")).toBe("General y Logística");
    expect(
      committeeRolesLabel(
        [
          financiero,
          { roleCode: "PUBLICIDAD", roleLabel: "Publicidad", coDirector: false },
          { roleCode: "RELACIONES_PUBLICAS", roleLabel: "Relaciones Públicas", coDirector: true },
        ],
        "Miembro",
      ),
    ).toBe("Financiero, Publicidad y Codirección de Relaciones Públicas");
  });
});

describe("guardas de un cambio de cargos", () => {
  it("nadie toca su propia fila salvo ADMIN", () => {
    expect(checkRolesChange({ actor: gh, isSelf: true, current: [], target: [] })).toBe("T-2163");
    expect(
      checkRolesChange({ actor: admin, isSelf: true, current: [], target: [logistica] }),
    ).toBeNull();
  });

  it("la codirección solo aplica a cargos de dirección", () => {
    const apoyoCo: RoleState = {
      roleCode: "APOYO",
      roleLabel: "Apoyo",
      coDirector: true,
      isLeadership: false,
      required: false,
    };
    expect(
      checkRolesChange({ actor: generalDelComite, isSelf: false, current: [], target: [apoyoCo] }),
    ).toBe("T-2169");
  });

  it("asignar o quitar un cargo de dirección exige nombrar cargos", () => {
    expect(checkRolesChange({ actor: gh, isSelf: false, current: [], target: [logistica] })).toBe(
      "T-2167",
    );
    expect(checkRolesChange({ actor: gh, isSelf: false, current: [logistica], target: [] })).toBe(
      "T-2167",
    );
    expect(checkRolesChange({ actor: gh, isSelf: false, current: [], target: [] })).toBeNull();
    expect(
      checkRolesChange({
        actor: generalDelComite,
        isSelf: false,
        current: [],
        target: [logistica],
      }),
    ).toBeNull();
    expect(
      checkRolesChange({
        actor: generalDelComite,
        isSelf: false,
        current: [],
        target: [coGeneral],
      }),
    ).toBeNull();
  });

  it("un director no deja un cargo obligatorio sin titular; ADMIN sí", () => {
    expect(
      checkRolesChange({
        actor: generalDelComite,
        isSelf: false,
        current: [financiero],
        target: [logistica],
      }),
    ).toBe("T-2168");
    expect(
      checkRolesChange({
        actor: generalDelComite,
        isSelf: false,
        current: [financiero],
        target: [financiero, logistica],
      }),
    ).toBeNull();
    expect(
      checkRolesChange({
        actor: generalDelComite,
        isSelf: false,
        current: [coGeneral],
        target: [],
      }),
    ).toBeNull();
    expect(
      checkRolesChange({ actor: admin, isSelf: false, current: [financiero], target: [] }),
    ).toBeNull();
  });

  it("nombra el cargo obligatorio que quedaría vacante en el texto del error", () => {
    expect(vacatedRequiredRole([financiero], [logistica])?.roleCode).toBe("FINANCIERO");
    expect(vacatedRequiredRole([coGeneral], [])).toBeNull();
    expect(rolesChangeMessage("T-2168", [financiero], [])).toContain("sin Financiero titular");
    expect(rolesChangeMessage("T-2167", [], [logistica])).toContain("General del comité");
  });
});
