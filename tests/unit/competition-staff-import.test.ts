import { describe, expect, it } from "vitest";
import {
  type CurrentStaffRow,
  leaderWarnings,
  parseStaffRole,
  parseStaffSheet,
  planStaffChanges,
  resolveDayBase,
  resolvePerson,
  type StaffBase,
  type StaffDirectory,
  splitStaffText,
  staffPlanFingerprint,
} from "@/modules/competition/domain/staff-import-pure";

// El personal desde la hoja del GAP (ADR-101): Persona, Base y Función. Todos los nombres son
// inventados; ninguno sale de la hoja real.

const thursday: StaffBase[] = Array.from({ length: 15 }, (_, index) => ({
  id: `j${index + 1}`,
  day: 1,
  orderIndex: index,
  name: index === 13 ? "Túnel Interactivo" : `Base ${index + 1}`,
}));
// El viernes como en producción: «Base 16» a «Base 30», salvo una inflable con otro nombre.
const friday: StaffBase[] = Array.from({ length: 15 }, (_, index) => ({
  id: `v${index + 16}`,
  day: 2,
  orderIndex: index,
  name: index === 13 ? "Coliseo de Ensayo" : `Base ${index + 16}`,
}));
const bases = [...thursday, ...friday];

const directory: StaffDirectory = {
  members: [
    { id: "p1", fullName: "Ana María de Ensayo Pérez" },
    { id: "p2", fullName: "Luis Felipe Prueba Gómez" },
    { id: "p3", fullName: "Sara Ensayo Sánchez" },
    { id: "p4", fullName: "Tomás Prueba" },
    { id: "p5", fullName: "Juana Ensayo Ríos" },
    { id: "p6", fullName: "Camila Prueba Soto" },
    { id: "p7", fullName: "Camila Prueba Suárez" },
    { id: "p8", fullName: "Mateo Ensayo Díaz" },
    { id: "p9", fullName: "Mateo Ensayo Díaz" },
    { id: "p10", fullName: "Valentina Muestra Arango" },
  ],
  byEmail: new Map([
    [
      "valentina.muestra@eafit.edu.co",
      { id: "p10", fullName: "Valentina Muestra Arango", status: "ACTIVE" },
    ],
    [
      "retirada.ensayo@eafit.edu.co",
      { id: "p11", fullName: "Retirada de Ensayo", status: "INACTIVE" },
    ],
  ]),
};

describe("texto pegado", () => {
  it("usa un solo separador y respeta las comillas con tabuladores adentro", () => {
    const text =
      '"ANA MARÍA DE ENSAYO PÉREZ\t\t";1;LIDER DE BASE\nLUIS FELIPE PRUEBA GÓMEZ;;CALIFICADOR';
    expect(splitStaffText(text)).toEqual([
      { line: 1, cells: ["ANA MARÍA DE ENSAYO PÉREZ", "1", "LIDER DE BASE"] },
      { line: 2, cells: ["LUIS FELIPE PRUEBA GÓMEZ", "", "CALIFICADOR"] },
    ]);
  });

  it("quita las celdas vacías del final y las filas vacías", () => {
    expect(splitStaffText("Ana\t1\tVAR\t\t\r\n\t\t\n\nSara\t\tVEEDOR ")).toEqual([
      { line: 1, cells: ["Ana", "1", "VAR"] },
      { line: 4, cells: ["Sara", "", "VEEDOR"] },
    ]);
  });
});

describe("función", () => {
  it("acepta tildes, plurales, mayúsculas y espacios", () => {
    expect(parseStaffRole("LIDER DE BASE ")).toBe("LEADER");
    expect(parseStaffRole("Líder")).toBe("LEADER");
    expect(parseStaffRole("CALIFICADOR")).toBe("GRADER");
    expect(parseStaffRole("calificadora")).toBe("GRADER");
    expect(parseStaffRole("VEEDORES")).toBe("OVERSEER");
    expect(parseStaffRole("VEEDOR ")).toBe("OVERSEER");
    expect(parseStaffRole("var")).toBe("VAR");
    expect(parseStaffRole("COLCHONCITO")).toBeUndefined();
  });
});

describe("base de la jornada", () => {
  it("el jueves va por nombre «Base N» o por puesto", () => {
    expect(resolveDayBase(bases, 1, 1)).toEqual({ kind: "OK", base: thursday[0] });
    expect(resolveDayBase(bases, 1, 14)).toEqual({ kind: "OK", base: thursday[13] });
  });

  it("el viernes vale del 16 al 30, por nombre o por puesto", () => {
    expect(resolveDayBase(bases, 2, 16)).toEqual({ kind: "OK", base: friday[0] });
    expect(resolveDayBase(bases, 2, 29)).toEqual({ kind: "OK", base: friday[13] });
  });

  it("un número de la otra jornada no pasa", () => {
    expect(resolveDayBase(bases, 1, 20)).toEqual({ kind: "OTHER_DAY" });
    expect(resolveDayBase(bases, 2, 3)).toEqual({ kind: "OTHER_DAY" });
    expect(resolveDayBase(bases, 1, 40)).toEqual({ kind: "MISSING" });
  });

  it("con el viernes nombrado «Base 1» a «Base 15», el 16 va al puesto 1", () => {
    const local = friday.map((base) => ({ ...base, name: `Base ${base.orderIndex + 1}` }));
    expect(resolveDayBase([...thursday, ...local], 2, 16)).toEqual({ kind: "OK", base: local[0] });
  });

  it("dos bases con el mismo «Base N» no valen por nombre", () => {
    const twice = [
      { id: "a", day: 1, orderIndex: 0, name: "Base 2" },
      { id: "b", day: 1, orderIndex: 1, name: "Base 2" },
    ];
    expect(resolveDayBase(twice, 1, 2)).toEqual({ kind: "OK", base: twice[1] });
  });
});

describe("persona", () => {
  it("encuentra el nombre exacto sin mayúsculas, tildes ni espacios de más", () => {
    expect(resolvePerson("  ANA MARIA DE ENSAYO  PEREZ ", directory)).toEqual({
      kind: "EXACT",
      member: { id: "p1", fullName: "Ana María de Ensayo Pérez" },
    });
  });

  it("acepta un nombre incompleto si hay un solo candidato", () => {
    expect(resolvePerson("LUIS PRUEBA GOMEZ", directory)).toMatchObject({
      kind: "PARTIAL",
      member: { id: "p2" },
    });
    expect(resolvePerson("SARA ENSAYO S", directory)).toMatchObject({
      kind: "PARTIAL",
      member: { id: "p3" },
    });
    expect(resolvePerson("TOMÁS PRUEBA GIRALDO", directory)).toMatchObject({
      kind: "PARTIAL",
      member: { id: "p4" },
    });
  });

  it("una palabra sola nunca es parcial, y «Juan» no es «Juana»", () => {
    expect(resolvePerson("TOMÁS", directory).kind).toBe("NOT_FOUND");
    expect(resolvePerson("JUAN ENSAYO RÍOS", directory)).toMatchObject({ kind: "NOT_FOUND" });
  });

  it("varios candidatos son ambiguos", () => {
    expect(resolvePerson("CAMILA PRUEBA", directory)).toEqual({
      kind: "AMBIGUOUS",
      options: ["Camila Prueba Soto", "Camila Prueba Suárez"],
    });
    expect(resolvePerson("MATEO ENSAYO DIAZ", directory).kind).toBe("AMBIGUOUS");
  });

  it("sugiere nombres parecidos, también en otro orden", () => {
    const match = resolvePerson("ARANGO VALENTINA MUESTRA", directory);
    expect(match).toEqual({ kind: "NOT_FOUND", suggestions: ["Valentina Muestra Arango"] });
    // Una letra cambiada no es parcial: se sugiere y la operación corrige la celda.
    const typo = resolvePerson("ANA MARIA DE ENSAYO PERES", directory);
    expect(typo.kind).toBe("NOT_FOUND");
    expect(typo.kind === "NOT_FOUND" && typo.suggestions[0]).toBe("Ana María de Ensayo Pérez");
  });

  it("por correo institucional, y dice si no es miembro activo", () => {
    expect(resolvePerson("Valentina.Muestra@eafit.edu.co", directory)).toMatchObject({
      kind: "EMAIL",
      member: { id: "p10" },
    });
    expect(resolvePerson("retirada.ensayo@eafit.edu.co", directory)).toEqual({
      kind: "INACTIVE",
      name: "Retirada de Ensayo",
    });
    expect(resolvePerson("nadie@eafit.edu.co", directory)).toEqual({
      kind: "NOT_FOUND",
      suggestions: [],
    });
  });
});

describe("hoja de una jornada", () => {
  const sheet = [
    "GAP JUEVES\t\t",
    "PERSONA \tBASE\tFUNCION ",
    "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER DE BASE",
    "LUIS PRUEBA GOMEZ\t\tCALIFICADOR",
    "SARA ENSAYO S\t\tVEEDORES",
    "TOMÁS PRUEBA\t2\tLIDER DE BASE ",
    "valentina.muestra@eafit.edu.co\t\tVAR",
    "64\tTOTAL PERSONAS\t",
  ].join("\n");

  it("salta el título, el encabezado y los totales, y la base baja", () => {
    const { rows, problems } = parseStaffSheet(sheet, 1, bases, directory);
    expect(problems).toEqual([]);
    expect(rows?.map((row) => [row.line, row.baseId, row.role, row.personId, row.match])).toEqual([
      [3, "j1", "LEADER", "p1", "EXACT"],
      [4, "j1", "GRADER", "p2", "PARTIAL"],
      [5, "j1", "OVERSEER", "p3", "PARTIAL"],
      [6, "j2", "LEADER", "p4", "EXACT"],
      [7, "j2", "VAR", "p10", "EMAIL"],
    ]);
    expect(rows?.[1]).toMatchObject({
      sheetName: "LUIS PRUEBA GOMEZ",
      memberName: "Luis Felipe Prueba Gómez",
    });
  });

  it("una fila sin persona y sin número corta la base que bajaba", () => {
    const text = [
      "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER",
      "\tCOLCHONCITO\t",
      "TOMÁS PRUEBA\t\tVEEDOR",
    ].join("\n");
    const { rows, problems } = parseStaffSheet(text, 1, bases, directory);
    expect(rows).toBeNull();
    expect(problems).toEqual([{ kind: "NO_BASE", line: 3 }]);
  });

  it("junta todos los problemas con su línea y no devuelve filas", () => {
    const text = [
      "TOMÁS PRUEBA\t\tLIDER DE BASE",
      "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER DE BASE\tDE MÁS",
      "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER DE BASE",
      "SARA ENSAYO SANCHEZ\t\tMASCOTA",
      "LUIS PRUEBA GOMEZ\t20\tVEEDOR",
      "LUIS PRUEBA GOMEZ\tBASE X\tVEEDOR",
      "CAMILA PRUEBA\t3\tVAR",
      "NADIE DE NINGUNA PARTE\t\tVAR",
      "retirada.ensayo@eafit.edu.co\t\tVAR",
      "ANA MARÍA DE ENSAYO PÉREZ\t4\tCALIFICADOR",
      "SIN FUNCION\t4",
    ].join("\n");
    const { rows, problems } = parseStaffSheet(text, 1, bases, directory);
    expect(rows).toBeNull();
    expect(problems).toEqual([
      { kind: "NO_BASE", line: 1 },
      { kind: "EXTRA_COLUMNS", line: 2 },
      { kind: "ROLE", line: 4, role: "MASCOTA" },
      { kind: "BASE_OTHER_DAY", line: 5, base: 20 },
      { kind: "BASE", line: 6, base: "BASE X" },
      {
        kind: "AMBIGUOUS",
        line: 7,
        name: "CAMILA PRUEBA",
        options: ["Camila Prueba Soto", "Camila Prueba Suárez"],
      },
      { kind: "NOT_FOUND", line: 8, name: "NADIE DE NINGUNA PARTE", suggestions: [] },
      { kind: "INACTIVE", line: 9, name: "Retirada de Ensayo" },
      { kind: "TWICE", line: 10, name: "Ana María de Ensayo Pérez", other: 3 },
      { kind: "COLUMNS", line: 11 },
    ]);
  });

  it("una hoja sin personas está vacía", () => {
    expect(parseStaffSheet("PERSONA\tBASE\tFUNCION\n\n", 1, bases, directory).problems).toEqual([
      { kind: "EMPTY" },
    ]);
  });

  it("el viernes lee la numeración del 16 al 30", () => {
    const { rows, problems } = parseStaffSheet(
      "TOMÁS PRUEBA;16;LIDER DE BASE\nSARA ENSAYO S;;CALIFICADOR\nLUIS PRUEBA GOMEZ;29;LIDER",
      2,
      bases,
      directory,
    );
    expect(problems).toEqual([]);
    expect(rows?.map((row) => row.baseId)).toEqual(["v16", "v16", "v29"]);
  });
});

describe("qué cambia", () => {
  const current: CurrentStaffRow[] = [
    { table: "STAFF", id: "s1", baseId: "j1", personId: "p1", role: "LEADER" },
    { table: "SUPPORT", id: "a1", baseId: "j1", personId: "p2", role: "GRADER" },
    { table: "SUPPORT", id: "a2", baseId: "j1", personId: "p3", role: "OVERSEER" },
  ];

  it("lo que sigue conserva su fila; cambiar de función es salir y entrar", () => {
    const plan = planStaffChanges(current, [
      { baseId: "j1", personId: "p1", role: "LEADER" },
      { baseId: "j1", personId: "p2", role: "OVERSEER" },
      { baseId: "j2", personId: "p4", role: "LEADER" },
    ]);
    expect(plan.keep.map((row) => row.id)).toEqual(["s1"]);
    expect(plan.remove.map((row) => row.id)).toEqual(["a1", "a2"]);
    expect(plan.add).toEqual([
      { baseId: "j1", personId: "p2", role: "OVERSEER" },
      { baseId: "j2", personId: "p4", role: "LEADER" },
    ]);
  });

  it("la huella no depende del orden y cambia con la jornada o con cualquier fila", () => {
    const desired = [
      { baseId: "j1", personId: "p1", role: "LEADER" as const },
      { baseId: "j2", personId: "p4", role: "LEADER" as const },
    ];
    const print = staffPlanFingerprint(1, desired, current);
    expect(print).toMatch(/^[0-9a-f]{64}$/);
    expect(staffPlanFingerprint(1, [...desired].reverse(), [...current].reverse())).toBe(print);
    expect(staffPlanFingerprint(2, desired, current)).not.toBe(print);
    expect(staffPlanFingerprint(1, desired.slice(1), current)).not.toBe(print);
    expect(staffPlanFingerprint(1, desired, current.slice(1))).not.toBe(print);
  });

  it("avisa de las bases sin líder o con más de uno", () => {
    const warnings = leaderWarnings(thursday.slice(0, 3), [
      { baseId: "j1", personId: "p1", role: "LEADER" },
      { baseId: "j2", personId: "p2", role: "LEADER" },
      { baseId: "j2", personId: "p3", role: "LEADER" },
      { baseId: "j3", personId: "p4", role: "GRADER" },
    ]);
    expect(warnings).toEqual([
      { kind: "MANY_LEADERS", baseId: "j2", n: 2 },
      { kind: "NO_LEADER", baseId: "j3" },
    ]);
  });
});
