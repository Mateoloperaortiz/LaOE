import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { occasionsResource } from "@/modules/participation/admin";
import { tList } from "@/shared/copy";
import { truncateAll } from "./db";

// El formulario de una ocasión ofrece los dos modos de aprobación (`approval`), cada uno con la
// etiqueta de su posición en T-567. Ninguna prueba leía esas opciones, y ninguna expresión de la
// spec #242 ve el recorrido que las arma, porque el orden está escrito en el sitio. Se fijan antes
// de pasar a leerlas por valor (DT-374, ADR-126 regla 13): como la tabla de enum-label-pairs,
// compara con posiciones literales de la lista.

describe("los modos de aprobación del recurso de ocasiones", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("ofrece cada modo, en su orden, con la pieza de T-567 de su posición", async () => {
    const list: readonly string[] = tList("T-567");
    const positions = { AUTO: 0, MANUAL: 1 };
    expect(new Set(list).size).toBe(2);

    // Como los resuelve el kit del admin antes de dibujar el formulario y de validar lo que llega.
    const fields =
      typeof occasionsResource.fields === "function"
        ? await occasionsResource.fields()
        : occasionsResource.fields;
    const approval = fields.find((field) => field.name === "approval");

    expect(approval?.options).toEqual(
      Object.entries(positions).map(([value, position]) => ({ value, label: list[position] })),
    );
  });
});
