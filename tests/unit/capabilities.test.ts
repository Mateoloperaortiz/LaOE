import { describe, expect, it } from "vitest";
import {
  areasFor,
  COMMITTEE_AREAS,
  COMMITTEE_CAPABILITIES,
  capabilitySchema,
  hasCapability,
  parseCapabilities,
} from "@/modules/people/domain/capabilities";
import { tList } from "@/shared/copy";

// Vocabulario cerrado de capacidades por cargo (ADR-058) y las áreas de la vista del comité.

describe("capacidades por cargo", () => {
  it("tiene una etiqueta por capacidad (T-2179) y un área por pestaña (T-2174)", () => {
    expect(tList("T-2179")).toHaveLength(COMMITTEE_CAPABILITIES.length);
    expect(tList("T-2174")).toHaveLength(COMMITTEE_AREAS.length);
    const covered = COMMITTEE_AREAS.flatMap((area) => area.capabilities);
    expect([...covered].sort()).toEqual([...COMMITTEE_CAPABILITIES].sort());
  });

  it("filtra lo que no está en el vocabulario y ordena sin repetir", () => {
    expect(parseCapabilities(["FINANCE", "ROSTER", "REY", "ROSTER"])).toEqual([
      "ROSTER",
      "FINANCE",
    ]);
    expect(capabilitySchema.safeParse("REY").success).toBe(false);
  });

  it("resuelve las áreas del actor por sus capacidades", () => {
    expect(areasFor(["ROSTER", "PERMANENCE"])).toEqual(["personas"]);
    expect(areasFor(["OCCASIONS"])).toEqual(["actividades"]);
    expect(areasFor(["FINANCE", "PARTNERS", "BOARD"])).toEqual([
      "comunicacion",
      "aliados",
      "finanzas",
    ]);
    expect(areasFor([])).toEqual([]);
    expect(hasCapability(new Set(["BOARD"]), "BOARD")).toBe(true);
    expect(hasCapability(["BOARD"], "FINANCE")).toBe(false);
  });
});
