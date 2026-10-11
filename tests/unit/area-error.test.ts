import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La pantalla de error de cada área (ADR-122 regla 19). Las unitarias no montan componentes: se lee
// que cada área tenga su límite de error y que los tres pinten la misma pantalla, con un solo texto.
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
    for (const path of [ROOT, ...AREAS]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain('import { ErrorScreen } from "@/shared/ui/ErrorScreen";');
      expect(source, path).toContain("<ErrorScreen reset={reset} />");
      expect(source, path).not.toMatch(/\bt\(/);
    }
    expect(readFileSync(SCREEN, "utf8")).toContain('t("T-033")');
  });

  it("solo la raíz abre su propio main: las áreas pintan dentro del que ya trae su navegación", () => {
    expect(readFileSync(ROOT, "utf8")).toContain("<main");
    for (const path of AREAS) {
      expect(readFileSync(path, "utf8"), path).not.toContain("<main");
    }
  });
});
