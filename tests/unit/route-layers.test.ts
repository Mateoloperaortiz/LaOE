import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Ninguna ruta queda fuera de una capa (ADR-188 reglas 4 y 6). Cada `page.tsx` de `src/app` vive dentro
// de un layout que monta un marco de la capa funcional (la Operación, Mi OE o acceso) o que declara la
// capa de marca (el portal y las pantallas de presentación). Una ruta nueva en una carpeta sin marco
// pone esto en rojo: fue así como las pantallas de acceso se quedaron sin el rediseño.

const APP = join(process.cwd(), "src/app");

/** Lo que monta un marco o declara la capa en un layout. */
const FRAME = /<AdminShell\b|<MemberShell\b|<AccessFrame\b|data-capa="marca"/;

/** Rutas sin interfaz: solo redirigen. */
const NO_INTERFACE = new Set(["asamblea/[publicId]"]);

function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pagesUnder(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** Los layouts que envuelven una página, sin contar el raíz, que solo pone el documento. */
function layoutsOf(page: string): string[] {
  const layouts: string[] = [];
  for (let dir = dirname(page); dir !== APP; dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) layouts.push(layout);
  }
  return layouts;
}

describe("las capas del rediseño", () => {
  it("cada página vive dentro de un marco que declara su capa", () => {
    const outside = pagesUnder(APP)
      .filter((page) => !NO_INTERFACE.has(relative(APP, dirname(page))))
      .filter((page) => !layoutsOf(page).some((layout) => FRAME.test(readFileSync(layout, "utf8"))))
      .map((page) => relative(APP, page));
    expect(outside).toEqual([]);
  });

  it("los tres marcos de trabajo declaran la capa funcional", () => {
    const frames = [
      "src/app/admin/_components/AdminShell.tsx",
      "src/app/app/_ui/MemberShell.tsx",
      "src/app/_ui/AccessFrame.tsx",
    ];
    const undeclared = frames.filter(
      (file) => !readFileSync(join(process.cwd(), file), "utf8").includes('data-capa="funcional"'),
    );
    expect(undeclared).toEqual([]);
  });

  it("las pantallas de no encontrado y de error, que viven fuera de las áreas, traen su marco", () => {
    for (const file of ["not-found.tsx", "error.tsx"]) {
      expect(readFileSync(join(APP, file), "utf8"), file).toMatch(/<AccessFrame\b/);
    }
  });

  it("una ruta sin interfaz de verdad no pinta nada", () => {
    for (const route of NO_INTERFACE) {
      const source = readFileSync(join(APP, route, "page.tsx"), "utf8");
      expect(source).toMatch(/redirect\(|notFound\(/);
      expect(source).not.toMatch(/<main\b/);
    }
  });
});
