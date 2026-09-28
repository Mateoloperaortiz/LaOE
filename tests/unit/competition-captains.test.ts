import { describe, expect, it } from "vitest";
import { normalizePhone, parseCaptainsSheet } from "@/modules/competition/domain/captains-pure";

// Los capitanes de la hoja de la OE (ADR-095): tres columnas, Equipo, Nombre y Celular. Los nombres
// y los celulares son sintéticos.

const teams = [
  { id: "t1", number: 1, name: "Herederos de prueba" },
  { id: "t2", number: 2, name: "Guardianes de Ensayo" },
  { id: "t27", number: 27, name: "Centauros de prueba" },
];

describe("celular de un capitán", () => {
  it("queda en diez dígitos, sin signos ni el 57 del país", () => {
    expect(normalizePhone("3001234567")).toBe("3001234567");
    expect(normalizePhone("300 123 4567")).toBe("3001234567");
    expect(normalizePhone("+57 300-123-4567")).toBe("3001234567");
    expect(normalizePhone("573001234567")).toBe("3001234567");
    expect(normalizePhone("  ")).toBeNull();
    expect(normalizePhone("300123456")).toBeUndefined();
    expect(normalizePhone("3001234567.0")).toBeUndefined();
    expect(normalizePhone("sin celular")).toBeUndefined();
  });
});

describe("lector de los capitanes", () => {
  it("lee las tres columnas con encabezado, por número, «Equipo N» o nombre", () => {
    const text = [
      "Equipo\tNombre Completo\tCelular",
      "Equipo 1\tAna de Ensayo\t3000000001",
      "1\tLuis de Ensayo\t300 000 0002",
      "guardianes de ensayo\t  Sara   de Ensayo \t",
      'EQUIPO 27\t"Tomás de Ensayo"\t+57 3000000027',
    ].join("\r\n");
    const { captains, problems } = parseCaptainsSheet(text, teams);
    expect(problems).toEqual([]);
    expect(captains).toEqual([
      { teamId: "t1", position: 1, name: "Ana de Ensayo", phone: "3000000001" },
      { teamId: "t1", position: 2, name: "Luis de Ensayo", phone: "3000000002" },
      { teamId: "t2", position: 1, name: "Sara de Ensayo", phone: null },
      { teamId: "t27", position: 1, name: "Tomás de Ensayo", phone: "3000000027" },
    ]);
  });

  it("acepta punto y coma o coma, y las celdas vacías del final", () => {
    const { captains, problems } = parseCaptainsSheet(
      "2;Ana de Ensayo;3000000001\n2,Luis de Ensayo,3000000002,,\n",
      teams,
    );
    expect(problems).toEqual([]);
    expect(captains?.map((captain) => captain.position)).toEqual([1, 2]);
  });

  it("rechaza la fila completa de la hoja y no guarda nada", () => {
    const text = [
      "Equipo 1\tAna de Ensayo\t3000000001",
      "1000000000\tLuis de Ensayo\tcorreo@ejemplo.test\t3000000002\tEPS\tO+\tEquipo 1",
    ].join("\n");
    const { captains, problems } = parseCaptainsSheet(text, teams);
    expect(captains).toBeNull();
    expect(problems).toEqual([{ kind: "EXTRA_COLUMNS", line: 2 }]);
  });

  it("informa cada problema con su línea", () => {
    const text = [
      "Equipo 1\tAna de Ensayo\t3000000001",
      "Equipo 9\tLuis de Ensayo\t3000000002",
      "Equipo 1\t\t3000000003",
      "Equipo 2\tSara de Ensayo\t12345",
      `Equipo 2\t${"x".repeat(81)}\t3000000004`,
      "Equipo 1\tLuis de Ensayo\t3000000005",
      "Equipo 1\tTomás de Ensayo\t3000000006",
    ].join("\n");
    const { captains, problems } = parseCaptainsSheet(text, teams);
    expect(captains).toBeNull();
    expect(problems).toEqual([
      { kind: "TEAM", line: 2, team: "Equipo 9" },
      { kind: "COLUMNS", line: 3 },
      { kind: "PHONE", line: 4 },
      { kind: "NAME", line: 5 },
      { kind: "TOO_MANY", line: 7, team: "1 Herederos de prueba" },
    ]);
  });

  it("una hoja vacía o con solo el encabezado no carga nada", () => {
    expect(parseCaptainsSheet("", teams).problems).toEqual([{ kind: "EMPTY" }]);
    expect(parseCaptainsSheet("Equipo\tNombre\tCelular\n", teams).problems).toEqual([
      { kind: "EMPTY" },
    ]);
  });
});
