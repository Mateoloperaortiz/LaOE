import { afterEach, describe, expect, it, vi } from "vitest";
import {
  documentTypeSchema,
  formatBirthDate,
  hasInstitutionalDomain,
  parseBirthDate,
} from "@/modules/people/domain/person-pure";
import { personInputSchema } from "@/modules/people/domain/persons";

const person = {
  firstName: "Persona",
  lastName: "Sintética",
  email: "identificacion@example.com",
};

afterEach(() => vi.useRealTimers());

describe("correo institucional", () => {
  it("admite el dominio exacto y sus subdominios, y nada que solo se le parezca", () => {
    const domains = ["eafit.edu.co"];
    expect(hasInstitutionalDomain("a@eafit.edu.co", domains)).toBe(true);
    expect(hasInstitutionalDomain("a@correo.eafit.edu.co", domains)).toBe(true);
    expect(hasInstitutionalDomain("a@gmail.com", domains)).toBe(false);
    expect(hasInstitutionalDomain("a@noeafit.edu.co", domains)).toBe(false);
    expect(hasInstitutionalDomain("sin-arroba", domains)).toBe(false);
  });
});

describe("identificación y fecha de nacimiento", () => {
  it("conserva ceros iniciales y distingue campos omitidos de borrado explícito", () => {
    const initial = personInputSchema.parse({
      ...person,
      documentType: "CC",
      documentNumber: " 0012300456 ",
      epikId: " 00034567 ",
      birthDate: "2004-03-21",
    });
    expect(initial).toMatchObject({
      documentType: "CC",
      documentNumber: "0012300456",
      epikId: "00034567",
      birthDate: "2004-03-21",
    });
    const omitted = personInputSchema.parse(person);
    for (const key of ["documentType", "documentNumber", "epikId", "birthDate"]) {
      expect(omitted).not.toHaveProperty(key);
    }
    expect(
      personInputSchema.parse({
        ...person,
        documentType: "",
        documentNumber: "",
        epikId: "",
        birthDate: "",
      }),
    ).toMatchObject({ documentType: null, documentNumber: null, epikId: null, birthDate: null });
  });

  it("acepta únicamente los tipos de documento canónicos", () => {
    for (const code of ["CC", "TI", "CE", "PPT"]) {
      expect(documentTypeSchema.safeParse(code).success).toBe(true);
    }
    expect(documentTypeSchema.safeParse("otro").success).toBe(false);
    expect(personInputSchema.safeParse({ ...person, documentType: "cc" }).success).toBe(false);
  });

  it("rechaza fechas imposibles y futuras y usa el día civil de Bogotá", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T02:00:00Z"));
    expect(parseBirthDate("2000-02-29")).toBe("2000-02-29");
    expect(parseBirthDate("2026-09-08")).toBe("2026-09-08");
    for (const invalid of ["1900-02-29", "2004-02-30", "0000-01-01", "2026-09-09", "21/03/2004"]) {
      expect(parseBirthDate(invalid)).toBeNull();
      expect(personInputSchema.safeParse({ ...person, birthDate: invalid }).success).toBe(false);
    }
  });

  it("presenta el nacimiento sin convertirlo al día anterior", () => {
    expect(formatBirthDate("2004-03-21")).toBe("21 de marzo de 2004");
    expect(formatBirthDate("2000-01-01")).toBe("1 de enero de 2000");
  });
});
