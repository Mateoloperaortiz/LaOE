import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Qué texto pinta el envío de un reto cuando la acción no responde (ADR-118 regla 21). Las unitarias no
// montan componentes: se lee qué código de copy pone el `catch` del envío.

const COMPONENTS = ["Trivia.tsx", "EvidenceUploader.tsx"].map(
  (name) => `src/modules/participation/components/${name}`,
);

function submitCatchCopy(path: string): string | undefined {
  const source = readFileSync(path, "utf8");
  return /await onSubmit\([\s\S]*?\} catch \{\s*(?:\/\/[^\n]*\s*)*setMessage\(t\("(T-\d+)"\)\);/.exec(
    source,
  )?.[1];
}

describe("envío de un reto sin respuesta", () => {
  it("trivia y evidencia avisan que no hubo confirmación, no que faltan respuestas", () => {
    for (const path of COMPONENTS) {
      expect(submitCatchCopy(path), path).toBe("T-3253");
    }
  });
});
