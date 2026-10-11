import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La pantalla de error de cada área (ADR-122 regla 19). Las unitarias no montan componentes: se lee
// que cada área tenga su límite de error y que los tres pinten la misma pantalla, con un solo texto,
// y las dos áreas con un solo contenedor (DT-337, inciso c; ADR-123 regla 21).
// Que la navegación del área se conserve lo comprueba `tests/e2e/area-error.spec.ts`.

const SCREEN = "src/shared/ui/ErrorScreen.tsx";
const ROOT = "src/app/error.tsx";
const AREAS = ["src/app/admin/error.tsx", "src/app/app/error.tsx"];

describe("pantalla de error por área", () => {
  it("la raíz, /admin y /app tienen cada una su límite de error, y es un componente de cliente", () => {
    for (const path of [ROOT, ...AREAS]) {
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path, "utf8").startsWith('"use client";'), path).toBe(true);
    }
  });

  it("los tres pintan la misma pantalla y ninguno escribe su propio texto", () => {
    const root = readFileSync(ROOT, "utf8");
    expect(root).toContain('import { ErrorScreen } from "@/shared/ui/ErrorScreen";');
    expect(root).toContain("<ErrorScreen reset={reset} />");
    expect(root).not.toMatch(/\bt\(/);
    for (const path of AREAS) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain('import { AreaErrorScreen } from "@/shared/ui/ErrorScreen";');
      expect(source, path).toContain("<AreaErrorScreen reset={reset} />");
      expect(source, path).not.toMatch(/\bt\(/);
    }
    const screen = readFileSync(SCREEN, "utf8");
    expect(screen).toContain('t("T-033")');
    // La pantalla de un área es la misma de la raíz dentro de su contenedor.
    expect(screen.slice(screen.indexOf("export function AreaErrorScreen"))).toContain(
      "<ErrorScreen reset={reset} />",
    );
  });

  it("el contenedor de un área está escrito una sola vez: ninguna de las dos lo repite", () => {
    for (const path of AREAS) {
      expect(readFileSync(path, "utf8"), path).not.toContain("className");
    }
    expect(readFileSync(SCREEN, "utf8").match(/max-w-2xl/g)).toHaveLength(1);
  });

  it("solo la raíz abre su propio main: las áreas pintan dentro del que ya trae su navegación", () => {
    expect(readFileSync(ROOT, "utf8")).toContain("<main");
    for (const path of [...AREAS, SCREEN]) {
      expect(readFileSync(path, "utf8"), path).not.toContain("<main");
    }
  });
});
