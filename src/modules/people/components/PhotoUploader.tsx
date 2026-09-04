"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { mediaUrl } from "@/shared/lib/media";

// Foto propia (ADR-034 regla 8): presign con `purpose: "photo"` → POST al bucket → confirm → la
// persona la fija como suya con la acción del servidor. Los bytes no pasan por la app (ADR-022).

type Labels = {
  field: string;
  button: string;
  help: string;
  remove: string;
  uploading: string; // con {nombre}
  done: string;
  errorFile: string;
  errorUpload: string;
  alt: string;
};

type Props = {
  currentAssetId: string | null;
  allowedTypes: string[];
  maxBytes: number;
  labels: Labels;
  onChange: (assetId: string | null) => Promise<{ ok: boolean; error?: string }>;
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

export function PhotoUploader({ currentAssetId, allowedTypes, maxBytes, labels, onChange }: Props) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function upload(file: File) {
    if (!allowedTypes.includes(file.type) || file.size > maxBytes || file.size === 0) {
      setState({ kind: "error", message: labels.errorFile });
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
          visibility: "PRIVATE",
          purpose: "photo",
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
        body: JSON.stringify({
          key: prepared.key,
          filename: file.name,
          visibility: "PRIVATE",
          purpose: "photo",
        }),
      });
      if (!confirm.ok) {
        throw new Error(await readError(confirm, labels.errorUpload));
      }
      const { id } = (await confirm.json()) as { id: string };
      const result = await onChange(id);
      if (!result.ok) {
        throw new Error(result.error ?? labels.errorUpload);
      }
      setState({ kind: "done" });
      router.refresh();
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

  async function remove() {
    const result = await onChange(null);
    if (!result.ok) {
      setState({ kind: "error", message: result.error ?? labels.errorUpload });
      return;
    }
    setState({ kind: "idle" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-5">
        {currentAssetId ? (
          // biome-ignore lint/performance/noImgElement: ADR-022, los bytes no atraviesan la app
          <img
            src={mediaUrl(currentAssetId, 480)}
            alt={labels.alt}
            width={96}
            height={96}
            className="size-24 rounded-full border border-borde object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-24 items-center justify-center rounded-full border border-borde bg-fondo-suave"
          />
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="eyebrow text-xs">
            {labels.field}
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
          {currentAssetId ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="boton-secundario self-start text-sm"
            >
              {labels.remove}
            </button>
          ) : null}
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
