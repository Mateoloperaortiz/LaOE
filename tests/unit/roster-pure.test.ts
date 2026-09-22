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
  type RosterCommittee,
  rowsFromCells,
  suggestCommittee,
  validateRoster,
} from "@/modules/people/domain/roster-pure";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";

const committees: RosterCommittee[] = [
  { id: "c-a3", slug: "a3", name: "A3", status: "ACTIVE" },
  { id: "c-pixel", slug: "pixel", name: "PIXEL", status: "ACTIVE" },
  { id: "c-ius", slug: "ius", name: "IUS", status: "ACTIVE" },
  { id: "c-eco", slug: "eco", name: "ECO", status: "ON_TRIAL" },
  // Desactivado (ADR-073): se reconoce por su sigla, pero ninguna fila lo puede usar.
  { id: "c-sos", slug: "sos", name: "SOS", status: "INACTIVE" },
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
      ["a3", [{ label: "General", coDirector: false }]],
      ["pixel", [{ label: "Logística", coDirector: false }]],
    ]);
    expect(assignments.error).toBeNull();
    expect(parseRoleAssignments("General", committees, parsed).error).toBe(7);
    expect(
      parseRoleAssignments("General", committees, [
        parsed[0] as (typeof committees)[number],
      ]).bySlug.get("a3"),
    ).toEqual([{ label: "General", coDirector: false }]);
    expect(parseRoleAssignments("General de NADA", committees, parsed).error).toBe(2);
    // ADR-058: varios cargos en el mismo comité y codirección, con o sin tilde ni guion.
    expect([
      ...parseRoleAssignments(
        "General de A3; Logística de A3; Codirección de Financiero de PIXEL",
        committees,
        parsed,
      ).bySlug,
    ]).toEqual([
      [
        "a3",
        [
          { label: "General", coDirector: false },
          { label: "Logística", coDirector: false },
        ],
      ],
      ["pixel", [{ label: "Financiero", coDirector: true }]],
    ]);
    expect(
      parseRoleAssignments("co-direccion de general", committees, [
        parsed[0] as (typeof committees)[number],
      ]).bySlug.get("a3"),
    ).toEqual([{ label: "general", coDirector: true }]);
  });
});

describe("validación por fila", () => {
  it("reconoce A–L, omite M/N y conserva identificadores como texto", () => {
    const header =
      "NOMBRE;APELLIDO;TIPO DE DOCUMENTO;DOCUMENTO;CORREO;ID EPIK;CELULAR;FECHA DE NACIMIENTO;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARNE;Columna1";
    const result = validate(
      [
        "Persona;Sintética;CEDULA DE CIUDADANIA;001234;campos@eafit.edu.co;000567;3001234567;2004-02-29;Derecho;A3;2026-2;NUEVO;ignorado;ignorado",
      ],
      header,
    );
    expect(detectMapping(header.split(";")).slice(-2)).toEqual([null, null]);
    expect(result.rows[0]).toMatchObject({
      documentType: "CC",
      documentNumber: "001234",
      epikId: "000567",
      birthDate: "2004-02-29",
      status: "ACTIVE",
      probation: false,
      errors: [],
    });
    expect(Object.values(result.rows[0]?.values ?? {})).not.toContain("ignorado");
  });

  it("conserva campos opcionales al importar vacíos y muestra cambios de datos personales", () => {
    const existing = new Map(catalog.existing);
    const original = catalog.existing.get("ana@eafit.edu.co");
    if (!original) throw new Error("Falta la persona sintética");
    existing.set("ana@eafit.edu.co", {
      ...original,
      documentType: "TI",
      documentNumber: "00123",
      epikId: "00045",
      birthDate: "2004-02-29",
    });
    const cells = parseCsv(
      "CORREO;TIPO DE DOCUMENTO;DOCUMENTO;ID EPIK;FECHA DE NACIMIENTO\nana@eafit.edu.co;;;;",
    );
    const mapping = detectMapping(cells[0] ?? []);
    const validateCells = () =>
      validateRoster(rowsFromCells(cells, mapping), mapping, { ...catalog, existing });
    expect(diffRoster(validateCells().rows, existing)[0]?.group).toBe("UNCHANGED");
    cells[1] = ["ana@eafit.edu.co", "CC", "00999", "00099", "2003-12-31"];
    expect(diffRoster(validateCells().rows, existing)[0]).toMatchObject({
      group: "CHANGED",
      changes: ["documentType", "documentNumber", "epikId", "birthDate"],
    });
    cells[1] = ["ana@eafit.edu.co", "DESCONOCIDO", "", "", "2003-02-29"];
    const invalid = validateCells().rows[0];
    expect(invalid?.errors).toEqual([]);
    expect(invalid?.warnings).toHaveLength(2);
    expect(invalid?.birthDate).toBeUndefined();
    expect(invalid?.documentType).toBeUndefined();
  });

  it("aplica equivalencias sin cargos implícitos y deja graduados e ingreso discrepante pendientes", () => {
    for (const value of ["NUEVO", "JUNTA"])
      expect(parseStatus(value)).toEqual({ status: "ACTIVE", probation: false });
    for (const value of ["PERIODO DE PRUEBA", "PERÍODO DE PRUEBA"])
      expect(parseStatus(value)).toEqual({ status: "ACTIVE", probation: true });
    for (const value of ["PRÁCTICA", "INTERCAMBIO"])
      expect(parseStatus(value)).toEqual({ status: "ON_LEAVE", probation: false });
    const junta = validate(
      ["Nueva;Persona;nueva@eafit.edu.co;;Derecho;A3;2026-2;JUNTA"],
      HEADER.split(";CARGO")[0],
    );
    expect(junta.rows[0]?.committees?.[0]?.roleCode).toBe("MIEMBRO");
    expect(
      validate(["Nueva;Persona;nueva@eafit.edu.co;;Derecho;A3;2026-2;GRADUADO;"]).rows[0]
        ?.errors[0],
    ).toContain(t("T-2083"));
    const existing = new Map(catalog.existing);
    const original = catalog.existing.get("ana@eafit.edu.co");
    if (!original) throw new Error("Falta la persona sintética");
    existing.set("ana@eafit.edu.co", {
      ...original,
      entryTerm: "2024-1",
    });
    const cells = parseCsv(
      `${HEADER}\nAna;Arango;ana@eafit.edu.co;;Derecho;A3;2024-2;Activo;General`,
    );
    const mapping = detectMapping(cells[0] ?? []);
    const result = validateRoster(rowsFromCells(cells, mapping), mapping, { ...catalog, existing });
    expect(diffRoster(result.rows, existing)[0]?.group).toBe("ERROR");
    expect(result.rows[0]?.errors[0]).toContain(t("T-2084"));
  });

  // ADR-073 regla 3: la sigla de un comité desactivado se reconoce, pero la fila queda en error.
  it("rechaza la fila que manda a alguien a un comité desactivado y no lo sugiere", () => {
    const result = validate([
      "Ana;Arango;ana@eafit.edu.co;;Derecho;SOS;2026-2;Activo;",
      "Bruno;Betancur;bruno@eafit.edu.co;;Derecho;A3, SOS;2026-2;Activo;",
      "Cami;Cadavid;cami@eafit.edu.co;;Derecho;SOSS;2026-2;Activo;",
    ]);
    const byEmail = (email: string) => result.rows.find((row) => row.email === email);
    expect(byEmail("ana@eafit.edu.co")?.errors[0]).toBe(t("T-2619", { sigla: "SOS" }));
    // Sin ningún comité vivo, la fila queda además sin el mínimo de uno.
    expect(byEmail("ana@eafit.edu.co")?.errors).toHaveLength(2);
    expect(byEmail("ana@eafit.edu.co")?.committees).toEqual([]);
    expect(byEmail("bruno@eafit.edu.co")?.errors[0]).toContain(t("T-2619", { sigla: "SOS" }));
    expect(byEmail("bruno@eafit.edu.co")?.committees?.map((item) => item.slug)).toEqual(["a3"]);
    // Una sigla mal escrita no se sugiere contra un comité desactivado.
    expect(byEmail("cami@eafit.edu.co")?.errors[0]).toContain("—");
  });

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
    expect(byEmail("bruno@gmail.com")?.errors).toEqual([tList("T-165")[1]]);
    expect(byEmail("cami@eafit.edu.co")?.errors[0]).toContain(
      fillCopy(tList("T-165")[2], { sigla: "PIXL", sugerencia: "pixel" }),
    );
    expect(byEmail("dani@eafit.edu.co")?.errors).toEqual([tList("T-165")[3]]);
    expect(byEmail("elena@eafit.edu.co")?.errors).toEqual([tList("T-165")[4]]);
    expect(byEmail("felipe@eafit.edu.co")?.errors).toEqual([tList("T-165")[5]]);
    expect(byEmail("gabi@eafit.edu.co")?.errors).toEqual([
      fillCopy(tList("T-165")[8], { cargo: "General", comité: "A3" }),
    ]);
    expect(byEmail("hugo@eafit.edu.co")?.errors).toEqual([tList("T-165")[7]]);
    expect(
      result.rows
        .filter((row) => row.email === "ana@eafit.edu.co")
        .every((row) => row.errors.includes(tList("T-165")[0])),
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

  it("traduce un cargo retirado al que lo reemplaza y avisa (ADR-060 regla 4)", () => {
    const withRetired: RosterCatalog = {
      ...catalog,
      roles: [
        ...catalog.roles,
        { code: "MERCADEO", label: "Mercadeo" },
        { code: "PUBLICIDAD", label: "Publicidad", retired: true, replacedByCode: "MERCADEO" },
        { code: "TESORERIA", label: "Tesorería", retired: true, replacedByCode: null },
      ],
    };
    const cells = parseCsv(
      [
        HEADER,
        "Ana;Arango;ana@eafit.edu.co;;Derecho;A3;2026-2;Activo;Publicidad de A3",
        "Beto;Bedoya;beto@eafit.edu.co;;Derecho;A3;2026-2;Activo;Tesorería de A3",
      ].join("\n"),
    );
    const mapping = detectMapping(cells[0] ?? []);
    const result = validateRoster(rowsFromCells(cells, mapping), mapping, withRetired);
    const ana = result.rows.find((row) => row.email === "ana@eafit.edu.co");
    expect(ana?.errors).toEqual([]);
    expect(ana?.committees?.[0]?.roles).toEqual([{ roleCode: "MERCADEO", coDirector: false }]);
    expect(ana?.warnings).toEqual([t("T-2213", { cargo: "Publicidad", nuevo: "Mercadeo" })]);
    const beto = result.rows.find((row) => row.email === "beto@eafit.edu.co");
    expect(beto?.errors).toEqual([t("T-2214", { cargo: "Tesorería" })]);
    expect(result.unknownRoles).toEqual([]);
  });

  it("en modo actualización solo acepta personas existentes", () => {
    const result = validate(
      ["ana@eafit.edu.co;General de A3", "nueva@eafit.edu.co;Logística"],
      "CORREO;CARGO",
    );
    expect(result.updateMode).toBe(true);
    expect(result.missingRequired).toContain("committees");
    expect(result.rows[0]?.errors).toEqual([]);
    expect(result.rows[1]?.errors).toEqual([tList("T-165")[9]]);
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
