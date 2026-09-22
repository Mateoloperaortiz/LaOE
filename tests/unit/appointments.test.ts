import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_KINDS,
  appointmentInputSchema,
  appointmentLabel,
  BOARD_APPOINTMENT_KINDS,
  MACROEVENT_ROLE_CODES,
  macroeventDirectorInputSchema,
} from "@/modules/people/domain/appointments";
import { t, tList } from "@/shared/copy";

// Cargos de junta y de GH (ADR-034 regla 13, ADR-057) y de macroevento (ADR-060 regla 9): las
// etiquetas de T-444 se resuelven por índice.

describe("cargos de junta y de GH", () => {
  it("tiene una etiqueta de T-444 por cada tipo, en el mismo orden", () => {
    const labels = tList("T-444");
    expect(labels).toHaveLength(APPOINTMENT_KINDS.length);
    expect(labels[APPOINTMENT_KINDS.indexOf("VP_COMMUNICATIONS")]).toBe(tList("T-444")[5]);
    expect(labels[APPOINTMENT_KINDS.indexOf("MACROEVENT_DIRECTOR")]).toBe(tList("T-444")[8]);
    expect(labels[APPOINTMENT_KINDS.indexOf("OTHER")]).toBe(tList("T-444")[9]);
  });

  it("acepta la vicepresidencia nueva sin título y sigue exigiéndolo para Otro", () => {
    expect(
      appointmentInputSchema.safeParse({ kind: "VP_COMMUNICATIONS", termId: "t1" }).success,
    ).toBe(true);
    expect(appointmentInputSchema.safeParse({ kind: "OTHER", termId: "t1" }).success).toBe(false);
  });

  it("no nombra direcciones de macroevento desde la Persona 360", () => {
    expect(BOARD_APPOINTMENT_KINDS).not.toContain("MACROEVENT_DIRECTOR");
    expect(BOARD_APPOINTMENT_KINDS).toHaveLength(APPOINTMENT_KINDS.length - 1);
    expect(
      appointmentInputSchema.safeParse({ kind: "MACROEVENT_DIRECTOR", termId: "t1" }).success,
    ).toBe(false);
  });
});

describe("mesa directiva de macroevento", () => {
  it("solo acepta cargos del catálogo del Reglamento (art. 41 a 43)", () => {
    expect(MACROEVENT_ROLE_CODES).toHaveLength(10);
    const base = { editionId: "e1", termId: "t1", personId: "p1" };
    expect(
      macroeventDirectorInputSchema.safeParse({ ...base, roleCode: "THE_GAMES" }).success,
    ).toBe(true);
    expect(macroeventDirectorInputSchema.parse({ ...base, roleCode: "GENERAL" }).coDirector).toBe(
      false,
    );
    expect(
      macroeventDirectorInputSchema.safeParse({ ...base, roleCode: "PRESIDENCIA" }).success,
    ).toBe(false);
  });

  it("etiqueta el cargo con la edición y marca la codirección (T-2268, T-2269)", () => {
    const titular = {
      kind: "MACROEVENT_DIRECTOR" as const,
      title: null,
      roleLabel: "Dirección de Logística",
      editionLabel: "Inventiva · 2026",
    };
    expect(appointmentLabel(titular)).toBe(
      t("T-2268", { cargo: "Dirección de Logística", edición: "Inventiva · 2026" }),
    );
    expect(appointmentLabel({ ...titular, coDirector: true })).toBe(
      t("T-2269", { cargo: "Dirección de Logística", edición: "Inventiva · 2026" }),
    );
    expect(appointmentLabel({ kind: "OTHER", title: "Tesorería" })).toBe("Tesorería");
    expect(appointmentLabel({ kind: "GH_HEAD", title: null })).toBe(tList("T-444")[6]);
  });
});
