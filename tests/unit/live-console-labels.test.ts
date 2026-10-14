import { describe, expect, it } from "vitest";
import { liveConsoleLabels } from "@/modules/participation/admin";
import { CHECK_IN_STATUSES } from "@/modules/participation/domain/check-in-pure";
import { tList } from "@/shared/copy";
import { labelsFromProps } from "@/shared/copy/client";

// Las etiquetas que la consola en vivo de una ocasión recibe por props (ADR-126 regla 5). Antes
// recibía las listas T-596 y T-597 y las leía con dos órdenes propios; ahora recibe la etiqueta de
// cada valor. Lo que no cambia es qué nombra: las cuatro fuentes y cuatro de los cinco estados.
// Como la tabla de enum-label-pairs, compara con posiciones literales de la lista.

describe("las etiquetas que la consola en vivo recibe por props", () => {
  it("cada fuente lleva la pieza de su posición en T-596", () => {
    const list: readonly string[] = tList("T-596");

    expect(liveConsoleLabels().sources).toEqual({
      SELF_QR: list[0],
      HOST: list[1],
      ADMIN: list[2],
      IMPORT: list[3],
    });
  });

  it("cada estado que la consola nombra lleva la pieza de su posición en T-597", () => {
    const list: readonly string[] = tList("T-597");
    const { statuses } = liveConsoleLabels();

    expect(statuses).toEqual({
      PENDING: list[0],
      APPROVED: list[1],
      REJECTED: list[2],
      CANCELLED: list[3],
    });
  });

  it("no traen EXCUSED: una asistencia excusada sigue mostrando su código en la consola (DT-364, decisión abierta 75)", () => {
    const statuses = labelsFromProps(liveConsoleLabels().statuses);

    expect(CHECK_IN_STATUSES).toContain("EXCUSED");
    expect(statuses.EXCUSED ?? "EXCUSED").toBe("EXCUSED");
  });

  it("son objetos llanos, los únicos que React deja pasar a un componente de cliente", () => {
    const { sources, statuses } = liveConsoleLabels();

    expect(Object.getPrototypeOf(sources)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(statuses)).toBe(Object.prototype);
  });

  it("leídas como las lee la consola, un valor ajeno cae al respaldo aunque se llame como una propiedad de Object", () => {
    const { sources, statuses } = liveConsoleLabels();
    const strangers = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];

    expect(strangers.map((value) => labelsFromProps(sources)[value] ?? value)).toEqual(strangers);
    expect(strangers.map((value) => labelsFromProps(statuses)[value] ?? value)).toEqual(strangers);
  });
});
