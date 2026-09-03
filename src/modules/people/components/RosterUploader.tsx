"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

// Paso 1 del asistente del roster (ADR-034): el archivo va al servidor, que lo guarda en el bucket y
// deja la vista previa en un ImportJob; después se navega a la revisión.

type Labels = {
  file: string;
  term: string;
  help: string;
  button: string;
  uploading: string; // con {nombre}
  error: string;
};

type Props = {
  endpoint: string;
  terms: Array<{ id: string; code: string }>;
  defaultTermId: string;
  labels: Labels;
};

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "error"; message: string };

export function RosterUploader({ endpoint, terms, defaultTermId, labels }: Props) {
  const router = useRouter();
  const fileId = useId();
  const termId = useId();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ kind: "error", message: labels.error });
      return;
    }
    setState({ kind: "uploading", name: file.name });
    try {
      const response = await fetch(endpoint, { method: "POST", body: data });
      const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!response.ok || !body.jobId) {
        throw new Error(body.error ?? labels.error);
      }
      router.push(`/admin/personas/importar?job=${body.jobId}`);
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : labels.error });
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito"
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={termId} className="eyebrow text-xs">
            {labels.term}
          </label>
          <select
            id={termId}
            name="termId"
            defaultValue={defaultTermId}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={fileId} className="eyebrow text-xs">
            {labels.file}
          </label>
          <input
            id={fileId}
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            disabled={state.kind === "uploading"}
            className="block max-w-xs text-sm file:mr-3 file:rounded-full file:border-0 file:bg-oe-sky file:px-4 file:py-2 file:font-bold file:text-oe-navy"
          />
        </div>
        <button type="submit" disabled={state.kind === "uploading"} className="boton-calido">
          {labels.button}
        </button>
      </div>
      <p className="max-w-prose text-sm text-tinta-suave">{labels.help}</p>
      <output className="block text-sm font-semibold" aria-live="polite">
        {state.kind === "uploading" ? labels.uploading.replace("{nombre}", state.name) : null}
        {state.kind === "error" ? (
          <span className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy">
            {state.message}
          </span>
        ) : null}
      </output>
    </form>
  );
}
