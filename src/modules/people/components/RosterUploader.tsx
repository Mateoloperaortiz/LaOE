"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";
import { ActionForm } from "@/shared/ui/ActionForm";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";

// Paso 1 del asistente del roster (ADR-034): el archivo va al servidor, que lo guarda en el bucket y
// deja la vista previa en un ImportJob; después se navega a la revisión.

type Labels = {
  file: string;
  term: string;
  help: string;
  button: string;
  uploading: string; // con {nombre}
  error: string;
  chooseFile: string;
  noFile: string;
  replaceFile: string;
  removeFile: string;
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
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ kind: "error", message: labels.error });
      return;
    }
    uploading.current = true;
    setState({ kind: "uploading", name: file.name });
    try {
      const response = await fetch(endpoint, { method: "POST", body: data });
      const body = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!response.ok || !body.jobId) {
        throw new UploadError(body.error ?? labels.error);
      }
      const href = `/admin/personas/importar?job=${body.jobId}&paso=columnas`;
      router.push(href, {
        scroll: !preservePageScroll(href, window.location.pathname, window.location.origin),
      });
    } catch (error) {
      setState({ kind: "error", message: uploadErrorMessage(error, labels.error) });
    } finally {
      uploading.current = false;
    }
  }

  return (
    <ActionForm
      onSubmit={submit}
      className="admin-upload flex min-w-0 flex-col gap-4 rounded-xl border border-borde bg-fondo p-5"
      aria-busy={state.kind === "uploading"}
    >
      <fieldset
        disabled={state.kind === "uploading"}
        className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
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
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={fileId} className="eyebrow text-xs">
            {labels.file}
          </label>
          <input
            ref={input}
            id={fileId}
            name="file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            disabled={state.kind === "uploading"}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="peer sr-only"
          />
          <label
            htmlFor={fileId}
            className="admin-file-picker flex min-w-0 cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-borde p-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-titulo"
          >
            <span className="font-semibold text-titulo">
              {file ? labels.replaceFile : labels.chooseFile}
            </span>
            <span className="min-w-0 break-all text-sm text-tinta-suave">
              {file
                ? `${file.name} · ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(file.size / (file.size >= 1024 * 1024 ? 1024 * 1024 : 1024))} ${file.size >= 1024 * 1024 ? "MB" : "KB"}`
                : labels.noFile}
            </span>
          </label>
          {file ? (
            <button
              type="button"
              className="self-start text-sm font-semibold underline"
              onClick={() => {
                setFile(null);
                setState({ kind: "idle" });
                if (input.current) input.current.value = "";
              }}
            >
              {labels.removeFile}
            </button>
          ) : null}
        </div>
        <button type="submit" disabled={state.kind === "uploading"} className="boton-calido">
          {labels.button}
        </button>
      </fieldset>
      <p className="max-w-prose text-sm text-tinta-suave">{labels.help}</p>
      <output className="block text-sm font-semibold" aria-live="polite">
        {state.kind === "uploading" ? labels.uploading.replace("{nombre}", state.name) : null}
        {state.kind === "error" ? (
          <span className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy">
            {state.message}
          </span>
        ) : null}
      </output>
    </ActionForm>
  );
}
