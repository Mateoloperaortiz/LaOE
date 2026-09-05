import { describe, expect, it } from "vitest";
import {
  actionsSchema,
  fieldsSchema,
  formOpenState,
  parseActions,
  parseFields,
  personDataFromAnswers,
  publicIdentitySchema,
  validateAnswers,
} from "@/modules/forms/domain/pure";

// Formularios propios (ADR-013, ADR-037): esquema de campos y acciones, apertura y validación de respuestas.

const fields = parseFields([
  { key: "motivo", label: "¿Por qué querés entrar?", type: "TEXTAREA", required: true },
  { key: "correo_alterno", label: "Otro correo", type: "EMAIL" },
  { key: "phone", label: "Celular", type: "PHONE", required: true },
  { key: "comite", label: "Comité", type: "SELECT", required: true, options: ["A3", "PIXEL"] },
  { key: "intereses", label: "Intereses", type: "MULTISELECT", options: ["Logística", "Diseño"] },
  { key: "acepta", label: "Acepto", type: "CHECKBOX", required: true },
  { key: "nacimiento", label: "Nacimiento", type: "DATE" },
]);

describe("esquema de campos", () => {
  it("acepta claves únicas con opciones donde hacen falta", () => {
    expect(fields).toHaveLength(7);
    expect(fields[3]?.options).toEqual(["A3", "PIXEL"]);
  });

  it("rechaza claves repetidas, claves con mayúsculas y selecciones sin opciones", () => {
    const repeated = fieldsSchema.safeParse([
      { key: "a", label: "A", type: "TEXT" },
      { key: "a", label: "B", type: "TEXT" },
    ]);
    expect(repeated.success).toBe(false);
    if (!repeated.success) {
      expect(repeated.error.issues[0]?.message).toBe("T-926");
    }
    expect(fieldsSchema.safeParse([{ key: "Nombre", label: "N", type: "TEXT" }]).success).toBe(
      false,
    );
    const noOptions = fieldsSchema.safeParse([{ key: "c", label: "C", type: "SELECT" }]);
    expect(noOptions.success).toBe(false);
    if (!noOptions.success) {
      expect(noOptions.error.issues[0]?.message).toBe("T-927");
    }
    expect(parseFields("basura")).toEqual([]);
  });
});

describe("acciones", () => {
  it("entrar a un pipeline o inscribirse a una edición exige crear la persona", () => {
    expect(actionsSchema.parse({ pipelineId: "p1" })).toEqual({
      createPerson: true,
      pipelineId: "p1",
      tagIds: [],
    });
    expect(actionsSchema.parse({ editionId: "e1", createPerson: false }).createPerson).toBe(true);
    expect(actionsSchema.parse({ tagIds: ["t1"] }).createPerson).toBe(false);
    expect(parseActions(null)).toEqual({ createPerson: false, tagIds: [] });
  });
});

describe("estado de apertura", () => {
  const base = { status: "OPEN" as const, opensAt: null, closesAt: null, maxSubmissions: null };
  const now = new Date("2026-09-05T12:00:00Z");

  it("abierto solo en OPEN, dentro de la ventana y bajo el tope", () => {
    expect(formOpenState(base, 0, now)).toBe("OPEN");
    expect(formOpenState({ ...base, status: "DRAFT" }, 0, now)).toBe("CLOSED");
    expect(formOpenState({ ...base, status: "CLOSED" }, 0, now)).toBe("CLOSED");
    expect(formOpenState({ ...base, opensAt: new Date("2026-09-06T00:00:00Z") }, 0, now)).toBe(
      "CLOSED",
    );
    expect(formOpenState({ ...base, closesAt: new Date("2026-09-05T12:00:00Z") }, 0, now)).toBe(
      "CLOSED",
    );
    expect(formOpenState({ ...base, maxSubmissions: 2 }, 2, now)).toBe("FULL");
    expect(formOpenState({ ...base, maxSubmissions: 2 }, 1, now)).toBe("OPEN");
  });
});

describe("validación de respuestas", () => {
  it("limpia y normaliza cada tipo", () => {
    const result = validateAnswers(fields, {
      motivo: "  Quiero aportar  ",
      correo_alterno: " Ana@Gmail.com ",
      phone: "300 123 4567",
      comite: "A3",
      intereses: ["Logística", "Logística"],
      acepta: "on",
      nacimiento: "2004-02-29",
    });
    expect(result).toEqual({
      ok: true,
      answers: {
        motivo: "Quiero aportar",
        correo_alterno: "ana@gmail.com",
        phone: "+573001234567",
        comite: "A3",
        intereses: ["Logística"],
        acepta: true,
        nacimiento: "2004-02-29",
      },
    });
  });

  it("señala cada error con su código de copy", () => {
    const result = validateAnswers(fields, {
      motivo: "",
      correo_alterno: "no-es-correo",
      phone: "12",
      comite: "OTRO",
      intereses: ["Nada"],
      acepta: "",
      nacimiento: "2026-02-30",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({
        motivo: "T-853",
        correo_alterno: "T-854",
        phone: "T-855",
        comite: "T-856",
        intereses: "T-856",
        acepta: "T-853",
        nacimiento: "T-857",
      });
    }
  });

  it("los opcionales vacíos no se guardan y las claves reservadas van a la persona", () => {
    const optional = parseFields([
      { key: "program", label: "Programa", type: "TEXT" },
      { key: "nota", label: "Nota", type: "TEXT" },
    ]);
    const result = validateAnswers(optional, { program: "Ingeniería", nota: "" });
    expect(result).toEqual({ ok: true, answers: { program: "Ingeniería" } });
    if (result.ok) {
      expect(personDataFromAnswers(result.answers)).toEqual({ program: "Ingeniería" });
    }
  });

  it("los datos implícitos del público exigen nombre, apellido y correo en minúsculas", () => {
    expect(
      publicIdentitySchema.parse({
        firstName: " Ana ",
        lastName: "Pérez",
        email: "ANA@EAFIT.EDU.CO",
      }),
    ).toEqual({ firstName: "Ana", lastName: "Pérez", email: "ana@eafit.edu.co" });
    expect(
      publicIdentitySchema.safeParse({ firstName: "", lastName: "P", email: "x" }).success,
    ).toBe(false);
  });
});
