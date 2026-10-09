import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";

// Qué texto ve la persona cuando una subida falla (ADR-118 regla 22).

const FALLBACK = "No pudimos subir el archivo. Intentá de nuevo.";
const UPLOADERS = [
  "src/modules/people/components/PhotoUploader.tsx",
  "src/modules/content/components/MediaUploader.tsx",
  "src/modules/content/components/DocumentUploader.tsx",
  "src/modules/people/components/RosterUploader.tsx",
];

describe("el texto de una subida que falló", () => {
  it("un fallo que la casa no lanzó muestra el texto del inventario, no el del navegador ni el de Next", () => {
    for (const raw of [
      "Failed to fetch",
      "Load failed",
      "NetworkError when attempting to fetch resource.",
    ]) {
      expect(uploadErrorMessage(new TypeError(raw), FALLBACK), raw).toBe(FALLBACK);
    }
    const next = new Error("An error occurred in the Server Components render.");
    expect(uploadErrorMessage(next, FALLBACK)).toBe(FALLBACK);
    expect(uploadErrorMessage("texto suelto", FALLBACK)).toBe(FALLBACK);
  });

  it("el motivo que respondió la casa sí se muestra", () => {
    const reason = new UploadError("El archivo pesa más de 5 MB.");

    expect(uploadErrorMessage(reason, FALLBACK)).toBe("El archivo pesa más de 5 MB.");
  });

  it("los cuatro subidores pasan sus fallos por ahí", () => {
    for (const path of UPLOADERS) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("error.message");
      expect(source, path).not.toContain("throw new Error(");
      expect(source, path).toContain("uploadErrorMessage(");
    }
  });
});
