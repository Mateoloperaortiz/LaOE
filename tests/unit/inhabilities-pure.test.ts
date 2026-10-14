import { describe, expect, it } from "vitest";
import {
  type HeldRole,
  INHABILITY_CODES,
  inhabilities,
  inhabilityLabels,
} from "@/modules/people/domain/inhabilities-pure";
import { tLabels, tList } from "@/shared/copy";

// Inhabilidades y topes (Regl. art. 11 y 27 par. 3 y 4; ADR-060 regla 11).

const base = { hasBoardAppointment: false, isNew: false, officeBan: false };
const general = (scopeId: string, coDirector = false): HeldRole => ({
  kind: "COMMITTEE",
  scopeId,
  roleCode: "GENERAL",
  coDirector,
});
const logistica = (scopeId: string, coDirector = false): HeldRole => ({
  kind: "COMMITTEE",
  scopeId,
  roleCode: "LOGISTICA",
  coDirector,
});
const macro = (scopeId: string, coDirector = false): HeldRole => ({
  kind: "MACROEVENT",
  scopeId,
  roleCode: "LOGISTICA",
  coDirector,
});

describe("inhabilidades para cargos", () => {
  it("tiene una etiqueta de T-2281 por código, en orden", () => {
    expect(tList("T-2281")).toHaveLength(INHABILITY_CODES.length);
    expect(inhabilityLabels(["BOARD"], tLabels("T-2281", INHABILITY_CODES))[0]).toContain(
      tList("T-2281")[1],
    );
  });

  it("no impide quitar cargos ni un cargo único a un activo sin sanción", () => {
    expect(inhabilities({ ...base, existing: [general("a3")], wanted: [] })).toEqual([]);
    expect(inhabilities({ ...base, existing: [], wanted: [general("a3")] })).toEqual([]);
  });

  it("inhabilidad viva, junta y nuevo impiden un cargo de mesa", () => {
    expect(
      inhabilities({ ...base, officeBan: true, existing: [], wanted: [general("a3")] }),
    ).toEqual(["OFFICE_BAN"]);
    expect(
      inhabilities({ ...base, hasBoardAppointment: true, existing: [], wanted: [general("a3")] }),
    ).toEqual(["BOARD"]);
    expect(inhabilities({ ...base, isNew: true, existing: [], wanted: [general("a3")] })).toEqual([
      "NEW_MEMBER",
    ]);
    // Un nuevo sí puede dirigir un macroevento: la Asamblea lo elige.
    expect(inhabilities({ ...base, isNew: true, existing: [], wanted: [macro("e1")] })).toEqual([]);
  });

  it("la junta no convive con la mesa de un comité", () => {
    expect(
      inhabilities({ ...base, officeBan: true, existing: [], wanted: [], wantsBoard: true }),
    ).toEqual(["OFFICE_BAN"]);
    expect(
      inhabilities({ ...base, existing: [general("a3")], wanted: [], wantsBoard: true }),
    ).toEqual(["BOARD"]);
    expect(
      inhabilities({ ...base, existing: [macro("e1")], wanted: [], wantsBoard: true }),
    ).toEqual([]);
  });

  it("topes: dos macroeventos, dos Generales, dos Financieros, más de dos cargos y sin codirección", () => {
    expect(inhabilities({ ...base, existing: [macro("e1")], wanted: [macro("e2", true)] })).toEqual(
      ["TWO_MACROEVENTS"],
    );
    expect(
      inhabilities({ ...base, existing: [general("a3")], wanted: [general("pixel", true)] }),
    ).toEqual(["TWO_GENERAL"]);
    expect(
      inhabilities({
        ...base,
        existing: [{ kind: "COMMITTEE", scopeId: "a3", roleCode: "FINANCIERO", coDirector: false }],
        wanted: [{ kind: "COMMITTEE", scopeId: "pixel", roleCode: "FINANCIERO", coDirector: true }],
      }),
    ).toEqual(["TWO_FINANCIERO"]);
    expect(
      inhabilities({
        ...base,
        existing: [general("a3"), logistica("pixel", true)],
        wanted: [macro("e1")],
      }),
    ).toEqual(["MAX_ROLES"]);
    expect(
      inhabilities({ ...base, existing: [general("a3")], wanted: [logistica("pixel")] }),
    ).toEqual(["NEEDS_CODIRECTION"]);
    expect(
      inhabilities({ ...base, existing: [general("a3")], wanted: [logistica("pixel", true)] }),
    ).toEqual([]);
  });

  it("reemplazar los cargos del mismo ámbito no cuenta lo que se está cambiando", () => {
    // El llamador excluye el ámbito; aquí solo se comprueba que dos cargos en el mismo comité cuentan.
    expect(
      inhabilities({ ...base, existing: [], wanted: [general("a3"), logistica("a3")] }),
    ).toEqual(["NEEDS_CODIRECTION"]);
  });
});
