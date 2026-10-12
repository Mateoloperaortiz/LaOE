import { describe, expect, it } from "vitest";
import { ledgerResource, occasionKindLabel } from "@/modules/participation/admin";
import { tList } from "@/shared/copy";

// Dos etiquetas de `participation` que salen de la casa en un CSV del admin: el tipo de una ocasión
// (`occasionKindLabel`, columna `tipo` del exporte de ocasiones) y el movimiento de una fila del
// ledger de GH Points. Se fijan antes de pasar a leerlas por valor (DT-011, spec #242): cada valor
// lleva la pieza de su posición en la lista, y un valor que el enum no trae conserva el respaldo de
// hoy, que espera la decisión abierta 75. Como la tabla de enum-label-pairs, compara con posiciones
// literales de la lista.

/** Valores que ningún enum trae; los cuatro últimos son propiedades de `Object.prototype`. */
const STRANGERS = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];

type OccasionNaming = Parameters<typeof occasionKindLabel>[0];
type LedgerRow = Parameters<NonNullable<typeof ledgerResource.exportRow>>[0];

function ledgerRow(kind: string): LedgerRow {
  return {
    createdAt: new Date("2026-03-02T15:00:00Z"),
    personName: "Persona de prueba",
    email: "persona@example.com",
    termCode: "2026-1",
    kind,
    points: 10,
    reason: "Motivo de prueba",
    reversedById: null,
  } as unknown as LedgerRow;
}

describe("cómo se nombra una ocasión", () => {
  const shortKinds: readonly string[] = tList("T-522");
  const activity = (category: string) =>
    occasionKindLabel({ kind: "ACTIVITY", assemblyKind: null, category } as OccasionNaming);
  const assembly = (assemblyKind: string | null) =>
    occasionKindLabel({ kind: "ASSEMBLY", assemblyKind, category: "OTHER" } as OccasionNaming);

  it("una actividad lleva la pieza de T-521 de su categoría", () => {
    const list: readonly string[] = tList("T-521");
    const positions = {
      INTEGRATION: 0,
      ATHLETIC_MATCH: 1,
      COMMITTEE_MEETING: 2,
      TALK: 3,
      WORKSHOP: 4,
      SOCIAL: 5,
      OTHER: 6,
      INDUCTION: 7,
    };

    for (const [category, position] of Object.entries(positions)) {
      expect(activity(category), category).toBe(list[position]);
    }
  });

  it("una asamblea lleva su nombre de T-522 y la pieza de T-565 de su tipo", () => {
    const list: readonly string[] = tList("T-565");
    const positions = { ORDINARY: 0, BOARD_ELECTION: 1, RUNOFF: 2 };

    for (const [assemblyKind, position] of Object.entries(positions)) {
      expect(assembly(assemblyKind), assemblyKind).toBe(`${shortKinds[1]} · ${list[position]}`);
    }
    expect(assembly(null)).toBe(shortKinds[1]);
  });

  it("una categoría que el enum no trae deja el nombre vacío (decisión abierta 75)", () => {
    expect(STRANGERS.map(activity)).toEqual(STRANGERS.map(() => ""));
  });

  it("un tipo de asamblea que el enum no trae deja solo el nombre de la asamblea (decisión abierta 75)", () => {
    expect(STRANGERS.map(assembly)).toEqual(STRANGERS.map(() => shortKinds[1]));
  });
});

describe("el movimiento de una fila en el CSV del ledger", () => {
  const movement = (kind: string) => ledgerResource.exportRow?.(ledgerRow(kind)).movimiento;

  it("es la pieza de T-085 de su tipo de movimiento", () => {
    const list: readonly string[] = tList("T-085");
    const positions = {
      CHECKIN: 0,
      ADJUSTMENT: 1,
      REVERSAL: 2,
      LEGACY: 3,
      WORDLE: 4,
      CHALLENGE: 5,
      BOOST: 6,
      GAME2048: 7,
      SUDOKU: 8,
      PANAL: 9,
    };

    for (const [kind, position] of Object.entries(positions)) {
      expect(movement(kind), kind).toBe(list[position]);
    }
  });

  it("un tipo que el enum no trae sale con su código (decisión abierta 75)", () => {
    expect(STRANGERS.map(movement)).toEqual(STRANGERS);
  });
});
