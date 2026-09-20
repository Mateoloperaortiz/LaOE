import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminNavGroups } from "@/app/admin/_kit/nav";

const groups = adminNavGroups();
const items = groups.flatMap((group) => group.items);

describe("navegación del área de administración", () => {
  it("cada destino tiene su página: un enlace del menú nunca lleva a un 404", () => {
    const missing = items
      .map((item) => item.href)
      .filter((href) => !existsSync(`src/app${href}/page.tsx`));
    expect(missing).toEqual([]);
  });

  it("cada destino aparece una sola vez, con etiqueta, y cada grupo tiene nombre", () => {
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(items.filter((item) => item.label.trim() === "")).toEqual([]);
    expect(groups.filter((group) => group.label.trim() === "" || group.items.length === 0)).toEqual(
      [],
    );
  });

  it("los destinos propios de los roles que no son ADMIN caen en algún grupo", () => {
    // El layout ubica un destino propio por prefijo de un destino del menú.
    const prefixes = items.map((item) => item.href);
    for (const own of [
      "/admin/comites/un-comite",
      "/admin/comites/un-comite/permanencia",
      "/admin/permanencia/grupos/un-grupo",
      "/admin/permanencia/evaluaciones",
      "/admin/junta",
      "/admin/personas/activacion",
    ]) {
      expect(prefixes.some((href) => own === href || own.startsWith(`${href}/`))).toBe(true);
    }
  });
});
