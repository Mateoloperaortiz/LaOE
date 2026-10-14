import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { t } from "@/shared/copy";
import { guardAction, submittedText } from "@/shared/ui/use-guarded-action-state";

// Los formularios aguantan el rechazo de su acción (ADR-118 regla 20).

type State = { message: string | null; text: string };

const MESSAGE = t("T-3252");
const HELPER = "src/shared/ui/use-guarded-action-state.ts";
// Los dos que ya atrapaban el rechazo a mano antes de que existiera el ayudante. La lista no crece: lo
// nuevo pasa por `useGuardedActionState`.
const HANDLED_BY_HAND = [
  "src/app/app/ajustes/SettingsForms.tsx",
  "src/app/app/solicitudes/RequestForm.tsx",
];

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

/**
 * ¿Este archivo usa `useActionState` sin manejar el rechazo de su acción? Mira el nombre del hook en el
 * código, no la forma de llamarlo: un alias del import o `React.useActionState` también cuentan.
 */
function leavesRejectionUnhandled(path: string, source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  if (path === HELPER || !/\buseActionState\b/.test(code)) {
    return false;
  }
  if (!HANDLED_BY_HAND.includes(path)) {
    return true;
  }
  // Quien no pasa por el ayudante tiene que atrapar el rechazo en cada llamada.
  const calls = count(code, "useActionState(") + count(code, "useActionState<");
  return calls > count(code, "unstable_rethrow(");
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
});

describe("la guarda de los formularios que usan el estado de una acción", () => {
  it("ningún componente usa useActionState sin manejar el rechazo de su acción", () => {
    const sources = sourceFiles("src").map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    }));

    const unguarded = sources
      .filter(({ path, source }) => leavesRejectionUnhandled(path, source))
      .map(({ path }) => path);

    expect(unguarded).toEqual([]);
    const guarded = sources
      .filter(({ source }) => source.includes("useGuardedActionState"))
      .map(({ path }) => path);
    expect(guarded).toContain("src/app/(public)/f/[slug]/FormularioPublico.tsx");
    expect(guarded).toContain("src/shared/admin-kit/ResourceForm.tsx");
  });

  it("un unstable_rethrow que atrapa otra cosa no cubre un useActionState sin atrapar", () => {
    const uploader = [
      'import { unstable_rethrow } from "next/navigation";',
      'import { useActionState } from "react";',
      "async function upload() { try { await send(); } catch (error) { unstable_rethrow(error); } }",
      "const [state, save] = useActionState(saveAction, null);",
    ].join("\n");

    expect(leavesRejectionUnhandled("src/modules/people/components/Otro.tsx", uploader)).toBe(true);
  });

  it("un alias del import o el espacio de nombres de React tampoco la esquivan", () => {
    const alias = [
      'import { useActionState as useFormAction } from "react";',
      "const [state, save] = useFormAction(saveAction, null);",
    ].join("\n");
    const namespace = [
      'import * as React from "react";',
      "const [state, save] = React.useActionState (saveAction, null);",
    ].join("\n");

    expect(leavesRejectionUnhandled("src/app/app/Otro.tsx", alias)).toBe(true);
    expect(leavesRejectionUnhandled("src/app/app/Otro.tsx", namespace)).toBe(true);
  });

  it("quien lo atrapa a mano tiene que hacerlo en cada llamada", () => {
    const [byHand] = HANDLED_BY_HAND;
    const once = [
      'import { unstable_rethrow } from "next/navigation";',
      'import { useActionState } from "react";',
      "const [a, saveA] = useActionState(async (p, f) => { try { return await x(p, f); } catch (e) { unstable_rethrow(e); return p; } }, null);",
      "const [b, saveB] = useActionState(saveAction, null);",
    ].join("\n");

    expect(leavesRejectionUnhandled(byHand ?? "", once)).toBe(true);
  });

  it("nombrarlo en un comentario o pasar por el ayudante no cuenta como usarlo", () => {
    const mentioned = [
      "// El estado viaja por `useActionState` para conservar lo escrito.",
      "/* useActionState( */",
      "export async function submitAction() {}",
    ].join("\n");
    const helped = [
      'import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";',
      "const [state, save] = useGuardedActionState(saveAction, null, onRejected);",
    ].join("\n");

    expect(leavesRejectionUnhandled("src/app/app/actions.ts", mentioned)).toBe(false);
    expect(leavesRejectionUnhandled("src/app/app/Otro.tsx", helped)).toBe(false);
  });
});
