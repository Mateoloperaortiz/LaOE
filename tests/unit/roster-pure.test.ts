import { describe, expect, it } from "vitest";
import {
  detectMapping,
  diffRoster,
  normalizeHeader,
  parseCsv,
  parseEntryTerm,
  parseRoleAssignments,
  parseStatus,
  type RosterCatalog,
  rowsFromCells,
  suggestCommittee,
  validateRoster,
} from "@/modules/people/domain/roster-pure";

const committees = [
  { id: "c-a3", slug: "a3", name: "A3" },
  { id: "c-pixel", slug: "pixel", name: "PIXEL" },
  { id: "c-ius", slug: "ius", name: "IUS" },
  { id: "c-eco", slug: "eco", name: "ECO" },
];

const catalog: RosterCatalog = {
  committees,
  roles: [
    { code: "GENERAL", label: "General" },
    { code: "LOGISTICA", label: "Logística" },
    { code: "MIEMBRO", label: "Miembro" },
  ],
  termCodes: ["2026-2"],
  domains: ["eafit.edu.co"],
  existing: new Map([
    [
      "ana@eafit.edu.co",
      {
        personId: "p1",
        firstName: "Ana",
        lastName: "Arango",
        phone: null,
        program: "Derecho",
        personalEmail: null,
        status: "ACTIVE" as const,
        probation: false,
        committees: [{ slug: "a3", roleCode: "GENERAL", transferredIn: false }],
      },
    ],
  ]),
};

const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";

function validate(lines: string[], header = HEADER) {
  const cells = parseCsv([header, ...lines].join("\n"));
  const mapping = detectMapping(cells[0] ?? []);
  return validateRoster(rowsFromCells(cells, mapping), mapping, catalog);
}

describe("lectura del archivo", () => {
  it("entiende BOM, comillas, punto y coma o coma y saltos de línea", () => {
    expect(parseCsv('﻿a;b\r\n"uno; dos";"dice ""hola"""\n')).toEqual([
      ["a", "b"],
      ["uno; dos", 'dice "hola"'],
    ]);
    expect(parseCsv("a,b\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reconoce las cabeceras sin importar mayúsculas ni tildes", () => {
    expect(normalizeHeader("  Entrada a la OÉ ")).toBe("ENTRADA A LA OE");
    expect(
      detectMapping([
        "nombre",
        "Apellido",
        "correo",
        "Comités",
        "entrada a la oe",
        "Estado",
        "Cargo",
        "Otra",
      ]),
    ).toEqual(["firstName", "lastName", "email", "committees", "entry", "status", "role", null]);
  });

  it("convierte semestres y fechas en términos, y el vocabulario de estados", () => {
    expect(parseEntryTerm("2024-2")).toBe("2024-2");
    expect(parseEntryTerm("2024 - 1")).toBe("2024-1");
    expect(parseEntryTerm("2024-08-15")).toBe("2024-2");
    expect(parseEntryTerm("15/03/2024")).toBe("2024-1");
    expect(parseEntryTerm("hace rato")).toBeNull();
    expect(parseStatus("Activo")).toEqual({ status: "ACTIVE", probation: false });
    expect(parseStatus("PRUEBA")).toEqual({ status: "ACTIVE", probation: true });
    expect(parseStatus("Licencia")).toEqual({ status: "ON_LEAVE", probation: false });
    expect(parseStatus("Retirado")).toEqual({ status: "INACTIVE", probation: false });
    expect(parseStatus("Fantasma")).toBeNull();
    expect(suggestCommittee("PIXL", ["a3", "pixel", "ius"])).toBe("pixel");
    expect(suggestCommittee("zzzz", ["a3", "pixel"])).toBeNull();
  });

  it("asigna cargos por comité", () => {
    const parsed = [
      committees[0] as (typeof committees)[number],
      committees[1] as (typeof committees)[number],
    ];
    const assignments = parseRoleAssignments(
      "General de A3; Logística de PIXEL",
      committees,
      parsed,
    );
    expect([...assignments.bySlug]).toEqual([
      ["a3", "General"],
      ["pixel", "Logística"],
    ]);
    expect(assignments.error).toBeNull();
    expect(parseRoleAssignments("General", committees, parsed).error).toBe(7);
    expect(
      parseRoleAssignments("General", committees, [
        parsed[0] as (typeof committees)[number],
      ]).bySlug.get("a3"),
    ).toBe("General");
    expect(parseRoleAssignments("General de NADA", committees, parsed).error).toBe(2);
  });
});

describe("validación por fila", () => {
  it("señala cada regla de 13-importacion con su texto", () => {
    const result = validate([
      "Ana;Arango;ana@eafit.edu.co;3001234567;Derecho;A3;2026-2;Activo;General de A3",
      "Bruno;Betancur;bruno@gmail.com;;Derecho;A3;2026-2;Activo;",
      "Cami;Cadavid;cami@eafit.edu.co;;Derecho;PIXL;2026-2;Activo;",
      "Dani;Duque;dani@eafit.edu.co;;Derecho;A3, PIXEL, IUS, ECO;2026-2;Activo;",
      "Elena;Echeverri;elena@eafit.edu.co;;Derecho;A3;;Activo;",
      "Felipe;Franco;felipe@eafit.edu.co;;Derecho;A3;2026-2;Fantasma;",
      "Gabi;Giraldo;gabi@eafit.edu.co;;Derecho;A3;2026-2;Activo;General de A3",
      "Hugo;Henao;hugo@eafit.edu.co;;Derecho;A3, PIXEL;2026-2;Activo;Tesorería",
      "ISABELA;Isaza;isa@eafit.edu.co;123;Derecho;IUS;2019-1;Prueba;Tesorería de IUS",
      "Repe;Tido;ana@eafit.edu.co;;Derecho;A3;2026-2;Activo;",
    ]);
    const byEmail = (email: string) => result.rows.find((row) => row.email === email);
    expect(byEmail("bruno@gmail.com")?.errors).toEqual(["Correo fuera del dominio institucional"]);
    expect(byEmail("cami@eafit.edu.co")?.errors[0]).toContain('"pixel"');
    expect(byEmail("dani@eafit.edu.co")?.errors).toEqual(["Más de 3 comités"]);
    expect(byEmail("elena@eafit.edu.co")?.errors).toEqual([
      "Semestre de ingreso vacío o inexistente",
    ]);
    expect(byEmail("felipe@eafit.edu.co")?.errors).toEqual(["Estado fuera de la lista"]);
    expect(byEmail("gabi@eafit.edu.co")?.errors).toEqual(["Dos Generales en A3"]);
    expect(byEmail("hugo@eafit.edu.co")?.errors).toEqual([
      "Cargo sin comité (la persona tiene varios)",
    ]);
    expect(
      result.rows
        .filter((row) => row.email === "ana@eafit.edu.co")
        .every((row) => row.errors.includes("Correo repetido en el archivo")),
    ).toBe(true);
    const isa = byEmail("isa@eafit.edu.co");
    expect(isa?.errors).toEqual([]);
    expect(isa?.warnings).toHaveLength(2);
    expect(isa?.probation).toBe(true);
    expect(isa?.committees?.[0]).toMatchObject({
      roleCode: "TESORERIA",
      newRoleLabel: "Tesorería",
    });
    expect(result.missingTerms).toEqual(["2019-1"]);
    expect(result.unknownRoles).toEqual(["Tesorería"]);
    expect(result.updateMode).toBe(false);
  });

  it("en modo actualización solo acepta personas existentes", () => {
    const result = validate(
      ["ana@eafit.edu.co;General de A3", "nueva@eafit.edu.co;Logística"],
      "CORREO;CARGO",
    );
    expect(result.updateMode).toBe(true);
    expect(result.missingRequired).toContain("committees");
    expect(result.rows[0]?.errors).toEqual([]);
    expect(result.rows[1]?.errors).toEqual(["Faltan columnas obligatorias para una persona nueva"]);
  });

  it("el diff distingue nuevas, con cambios y sin cambios por las columnas presentes", () => {
    const result = validate([
      "Ana;Arango;ana@eafit.edu.co;;Derecho;A3;2026-2;Activo;General de A3",
      "Nueva;Persona;nueva@eafit.edu.co;;Derecho;PIXEL;2026-2;Activo;",
    ]);
    const existing = new Map([
      [
        "ana@eafit.edu.co",
        {
          personId: "p1",
          firstName: "Ana",
          lastName: "Arango",
          phone: null,
          program: "Derecho",
          personalEmail: null,
          status: "ACTIVE" as const,
          probation: false,
          committees: [{ slug: "a3", roleCode: "GENERAL", transferredIn: false }],
        },
      ],
    ]);
    const diff = diffRoster(result.rows, existing);
    expect(diff.map((item) => item.group)).toEqual(["UNCHANGED", "NEW"]);
    const changed = validate([
      "Ana;Arango;ana@eafit.edu.co;3001234567;Derecho;A3, IUS;2026-2;Licencia;",
    ]);
    expect(diffRoster(changed.rows, existing)[0]).toMatchObject({
      group: "CHANGED",
      changes: ["phone", "status", "committees"],
    });
  });
});
