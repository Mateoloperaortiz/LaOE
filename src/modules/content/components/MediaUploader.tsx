"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

// Subida directa al bucket (ADR-022): presign → POST al bucket → confirm. Los bytes no pasan por la app.

type Labels = {
  button: string;
  help: string;
  uploading: string; // con {nombre}
  done: string;
  errorType: string;
  errorSize: string;
  errorUpload: string;
  visibility: string;
  visibilityOptions: [string, string]; // [pública, privada]
};

type Props = {
  allowedTypes: string[];
  minBytes: number;
  maxBytes: number;
  labels: Labels;
};

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

interface PreparedUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function MediaUploader({ allowedTypes, minBytes, maxBytes, labels }: Props) {
  const router = useRouter();
  const inputId = useId();
  const visibilityId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function upload(file: File) {
    if (!allowedTypes.includes(file.type)) {
      setState({ kind: "error", message: labels.errorType });
      return;
    }
    if (file.size < minBytes || file.size > maxBytes) {
      setState({ kind: "error", message: labels.errorSize });
      return;
    }
    setState({ kind: "uploading", name: file.name });
    try {
      const presign = await fetch("/api/media/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          visibility,
        }),
      });
      if (!presign.ok) {
        throw new Error(await readError(presign, labels.errorUpload));
      }
      const prepared = (await presign.json()) as PreparedUpload;
      const form = new FormData();
      for (const [name, value] of Object.entries(prepared.fields)) {
        form.append(name, value);
      }
      form.append("file", file, file.name);
      const stored = await fetch(prepared.url, { method: "POST", body: form });
      if (!stored.ok) {
        throw new Error(labels.errorUpload);
      }
      const confirm = await fetch("/api/media/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: prepared.key, filename: file.name, visibility }),
      });
      if (!confirm.ok) {
        throw new Error(await readError(confirm, labels.errorUpload));
      }
      setState({ kind: "done" });
      router.refresh();
      // Las variantes las genera el outbox en segundos: se vuelve a leer el listado.
      setTimeout(() => router.refresh(), 4_000);
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : labels.errorUpload,
      });
    } finally {
      if (input.current) {
        input.current.value = "";
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="eyebrow text-xs">
            {labels.button}
          </label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={allowedTypes.join(",")}
            disabled={state.kind === "uploading"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void upload(file);
              }
            }}
            className="block max-w-xs text-sm file:mr-3 file:rounded-full file:border-0 file:bg-oe-orange file:px-4 file:py-2 file:font-bold file:text-oe-navy"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={visibilityId} className="eyebrow text-xs">
            {labels.visibility}
          </label>
          <select
            id={visibilityId}
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value === "PRIVATE" ? "PRIVATE" : "PUBLIC")
            }
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          >
            <option value="PUBLIC">{labels.visibilityOptions[0]}</option>
            <option value="PRIVATE">{labels.visibilityOptions[1]}</option>
          </select>
        </div>
      </div>
      <p className="max-w-prose text-sm text-tinta-suave">{labels.help}</p>
      <output className="block text-sm font-semibold" aria-live="polite">
        {state.kind === "uploading" ? labels.uploading.replace("{nombre}", state.name) : null}
        {state.kind === "done" ? labels.done : null}
        {state.kind === "error" ? (
          <span className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy">
            {state.message}
          </span>
        ) : null}
      </output>
    </div>
  );
}
