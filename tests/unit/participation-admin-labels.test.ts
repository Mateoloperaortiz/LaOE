import { describe, expect, it } from "vitest";
import { ledgerResource, occasionKindLabel } from "@/modules/participation/admin";
import { POINT_ENTRY_KINDS } from "@/modules/participation/domain/ledger-pure";
import { ASSEMBLY_KINDS, OCCASION_CATEGORIES } from "@/modules/participation/domain/occasion-pure";
import { tList } from "@/shared/copy";

// Dos etiquetas de `participation` que salen de la casa en un CSV del admin: el tipo de una ocasión
// (`occasionKindLabel`, columna `tipo` del exporte de ocasiones) y el movimiento de una fila del
// ledger de GH Points. Se fijan antes de pasar a leerlas por valor (DT-011, spec #242): cada valor
// lleva la pieza de su posición en la lista, y un valor que el enum no trae conserva el respaldo de
// hoy, que espera la decisión abierta 75.

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

  it("una actividad lleva la pieza de T-521 de su categoría", () => {
    const list: readonly string[] = tList("T-521");

    expect(list).toHaveLength(OCCASION_CATEGORIES.length);
    expect(
      OCCASION_CATEGORIES.map((category) =>
        occasionKindLabel({ kind: "ACTIVITY", assemblyKind: null, category }),
      ),
    ).toEqual(OCCASION_CATEGORIES.map((_, index) => list[index]));
  });

  it("una asamblea lleva su nombre de T-522 y la pieza de T-565 de su tipo", () => {
    const list: readonly string[] = tList("T-565");

    expect(list).toHaveLength(ASSEMBLY_KINDS.length);
    expect(
      ASSEMBLY_KINDS.map((assemblyKind) =>
        occasionKindLabel({ kind: "ASSEMBLY", assemblyKind, category: "OTHER" }),
      ),
    ).toEqual(ASSEMBLY_KINDS.map((_, index) => `${shortKinds[1]} · ${list[index]}`));
    expect(occasionKindLabel({ kind: "ASSEMBLY", assemblyKind: null, category: "OTHER" })).toBe(
      shortKinds[1],
    );
  });

  it("una categoría que el enum no trae deja el nombre vacío (decisión abierta 75)", () => {
    expect(
      STRANGERS.map((category) =>
        occasionKindLabel({ kind: "ACTIVITY", assemblyKind: null, category } as OccasionNaming),
      ),
    ).toEqual(STRANGERS.map(() => ""));
  });

  it("un tipo de asamblea que el enum no trae deja solo el nombre de la asamblea (decisión abierta 75)", () => {
    expect(
      STRANGERS.map((assemblyKind) =>
        occasionKindLabel({ kind: "ASSEMBLY", assemblyKind, category: "OTHER" } as OccasionNaming),
      ),
    ).toEqual(STRANGERS.map(() => shortKinds[1]));
  });
});

describe("el movimiento de una fila en el CSV del ledger", () => {
  const movement = (kind: string) => ledgerResource.exportRow?.(ledgerRow(kind)).movimiento;

  it("es la pieza de T-085 de su tipo de movimiento", () => {
    const list: readonly string[] = tList("T-085");

    expect(list).toHaveLength(POINT_ENTRY_KINDS.length);
    expect(POINT_ENTRY_KINDS.map(movement)).toEqual(
      POINT_ENTRY_KINDS.map((_, index) => list[index]),
    );
  });

  it("un tipo que el enum no trae sale con su código (decisión abierta 75)", () => {
    expect(STRANGERS.map(movement)).toEqual(STRANGERS);
  });
});
