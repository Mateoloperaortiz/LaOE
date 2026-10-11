import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t } from "@/shared/copy";

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

// Los textos propios de la evidencia (ADR-122 regla 16): su formulario no tiene preguntas, así que
// ninguno de sus rechazos pinta el de la trivia.

const EVIDENCE = "src/modules/participation/components/EvidenceUploader.tsx";

function denialCopy(reason: string): string | undefined {
  return new RegExp(`\\b${reason}: "(T-\\d+)"`).exec(readFileSync(EVIDENCE, "utf8"))?.[1];
}

describe("textos del envío de una evidencia", () => {
  it("ningún texto de la evidencia habla de preguntas", () => {
    expect(readFileSync(EVIDENCE, "utf8")).not.toContain("T-2426");
  });

  it("un texto fuera del largo pedido dice cuál es el largo", () => {
    const code =
      /if \(!textValid\) \{\s*setMessage\(t\("(T-\d+)", \{ min: textMin, max: textMax \}\)\);/.exec(
        readFileSync(EVIDENCE, "utf8"),
      )?.[1];
    expect(code).toBe("T-3261");
    expect(t("T-3261", { min: 20, max: 500 })).toMatch(/20.*500/);
  });

  it("lo que la casa no acepta por su contenido y el reintento con otro contenido tienen cada uno su texto", () => {
    expect(denialCopy("INVALID_INPUT")).toBe("T-3262");
    expect(denialCopy("INCOMPLETE")).toBe("T-3262");
    expect(denialCopy("REQUEST_CONFLICT")).toBe("T-2444");
  });
});
