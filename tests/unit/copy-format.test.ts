import { describe, expect, it } from "vitest";
import { tList as tListServer, t as tServer } from "@/shared/copy";
import { t, tList } from "@/shared/copy/client";
import { fillCopy, splitCopyList } from "@/shared/copy/format";
import { textosCliente } from "@/shared/copy/textos.client.generated";
import { textos } from "@/shared/copy/textos.generated";

describe("formato del inventario de textos", () => {
  it("reemplaza las variables y deja intacta la que no recibe valor", () => {
    expect(fillCopy("Hola {nombre}, tenés {n} puntos", { nombre: "Ana", n: 3 })).toBe(
      "Hola Ana, tenés 3 puntos",
    );
    expect(fillCopy("Faltan {n}", {})).toBe("Faltan {n}");
  });

  it("parte una lista por el punto medio y recorta cada ítem", () => {
    expect(splitCopyList("Uno · Dos ·Tres")).toEqual(["Uno", "Dos", "Tres"]);
    expect(splitCopyList("Solo")).toEqual(["Solo"]);
  });

  it("cliente y servidor devuelven lo mismo para el mismo código", () => {
    for (const code of Object.keys(textosCliente) as (keyof typeof textosCliente)[]) {
      expect(t(code)).toBe(tServer(code));
      expect([...tList(code)]).toEqual([...tListServer(code)]);
    }
  });

  // DT-122: T-189 traía `{aprobada/rechazada}`, que `fillCopy` no reconoce, y el push de la respuesta a
  // una solicitud salía con el marcador crudo. Lo que el inventario escribe entre llaves es una variable:
  // si `fillCopy` no la sabe reemplazar con su propio nombre, el texto llega así a quien lo lee.
  it("todo marcador del inventario es uno que fillCopy sabe reemplazar", () => {
    const stuck: string[] = [];
    for (const [code, entry] of Object.entries(textos)) {
      for (const [marker, name = ""] of entry.text.matchAll(/\{([^{}]*)\}/g)) {
        if (fillCopy(marker, { [name.trim()]: "valor" }) !== "valor") {
          stuck.push(`${code}: ${marker}`);
        }
      }
    }
    expect(stuck).toEqual([]);
  });
});
