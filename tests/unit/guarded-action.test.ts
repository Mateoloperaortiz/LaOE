import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { guardAction, submittedText } from "@/shared/ui/use-guarded-action-state";

// Los formularios aguantan el rechazo de su acción (ADR-118 regla 20).

type State = { message: string | null; text: string };

const MESSAGE = "No pudimos confirmar el envío.";
const HELPER = "src/shared/ui/use-guarded-action-state.ts";

const keepText = ({
  previous,
  payload,
  message,
}: {
  previous: State;
  payload: FormData;
  message: string;
}): State => ({ ...previous, message, text: submittedText(payload, "text") });

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("el estado de una acción con el rechazo manejado", () => {
  it("si la acción rechaza, el formulario recibe un estado con el aviso y lo que se envió", async () => {
    const offline = vi.fn(async (): Promise<State> => {
      throw new TypeError("Failed to fetch");
    });
    const sent = new FormData();
    sent.set("text", "Lo que la persona alcanzó a escribir");

    const next = await guardAction(offline, keepText, MESSAGE)({ message: null, text: "" }, sent);

    expect(next).toEqual({ message: MESSAGE, text: "Lo que la persona alcanzó a escribir" });
  });

  it("lo que responde la acción pasa tal cual", async () => {
    const saved = async (previous: State): Promise<State> => ({ ...previous, message: "Guardado" });

    const next = await guardAction(
      saved,
      keepText,
      MESSAGE,
    )({ message: null, text: "x" }, new FormData());

    expect(next).toEqual({ message: "Guardado", text: "x" });
  });

  it("una redirección de la acción no se convierte en aviso de fallo", async () => {
    let signal: unknown;
    try {
      redirect("/ingresar");
    } catch (error) {
      signal = error;
    }
    const expired = async (): Promise<State> => {
      throw signal;
    };
    const onRejected = vi.fn(keepText);

    await expect(
      guardAction(expired, onRejected, MESSAGE)({ message: null, text: "" }, new FormData()),
    ).rejects.toBe(signal);
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("un archivo o un campo ausente cuentan como texto vacío", () => {
    const sent = new FormData();
    sent.set("archivo", new Blob(["a,b"]), "roster.csv");

    expect(submittedText(sent, "archivo")).toBe("");
    expect(submittedText(sent, "no-existe")).toBe("");
  });

  it("ningún componente llama useActionState sin manejar el rechazo de su acción", () => {
    const unguarded = sourceFiles("src")
      .filter((path) => path !== HELPER)
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        const calls = count(source, "useActionState(") + count(source, "useActionState<");
        // Quien no pasa por el ayudante tiene que atrapar el rechazo en cada llamada.
        return calls > count(source, "unstable_rethrow(");
      });

    expect(unguarded).toEqual([]);
    const guarded = sourceFiles("src").filter((path) =>
      readFileSync(path, "utf8").includes("useGuardedActionState"),
    );
    expect(guarded).toContain("src/app/(public)/f/[slug]/FormularioPublico.tsx");
    expect(guarded).toContain("src/shared/admin-kit/ResourceForm.tsx");
  });
});
