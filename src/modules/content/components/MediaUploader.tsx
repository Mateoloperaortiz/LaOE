"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";
import { ActionForm } from "@/shared/ui/ActionForm";
import { uploadToBucket } from "@/shared/ui/bucket-upload";
import { uploadErrorMessage } from "@/shared/ui/upload-error";

// Subida directa al bucket (ADR-022) por `uploadToBucket` (ADR-121 regla 14): presign → POST al
// bucket → confirm. Los bytes no pasan por la app.

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
  errorFile: string;
  chooseFile: string;
  noFile: string;
  replaceFile: string;
  removeFile: string;
};

type Props = {
  allowedTypes: string[];
  minBytes: number;
  maxBytes: number;
  labels: Labels;
  successHref: string;
};

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function MediaUploader({ allowedTypes, minBytes, maxBytes, labels, successHref }: Props) {
  const router = useRouter();
  const inputId = useId();
  const visibilityId = useId();
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function upload(file: File) {
    if (uploading.current) return;
    if (!allowedTypes.includes(file.type)) {
      setState({ kind: "error", message: labels.errorType });
      return;
    }
    if (file.size < minBytes || file.size > maxBytes) {
      setState({ kind: "error", message: labels.errorSize });
      return;
    }
    uploading.current = true;
    setState({ kind: "uploading", name: file.name });
    try {
      await uploadToBucket(file, {
        presign: {
          url: "/api/media/presign",
          body: {
            filename: file.name,
            contentType: file.type,
            byteSize: file.size,
            visibility,
          },
        },
        confirm: { url: "/api/media/confirm", body: { filename: file.name, visibility } },
      });
      setState({ kind: "done" });
      if (input.current) input.current.value = "";
      setFile(null);
      router.push(successHref, {
        scroll: !preservePageScroll(successHref, window.location.pathname, window.location.origin),
      });
      router.refresh();
      // Las variantes las genera el outbox en segundos: se vuelve a leer el listado.
      setTimeout(() => router.refresh(), 4_000);
    } catch (error) {
      setState({
        kind: "error",
        message: uploadErrorMessage(error, labels.errorUpload),
      });
    } finally {
      uploading.current = false;
    }
  }

  return (
    <ActionForm
      onSubmit={(event) => {
        event.preventDefault();
        if (file) void upload(file);
        else setState({ kind: "error", message: labels.errorFile });
      }}
      className="admin-upload flex min-w-0 flex-col gap-5"
      aria-busy={state.kind === "uploading"}
    >
      <p id={`${inputId}-help`} className="text-sm text-tinta-suave">
        {labels.help}
      </p>
      <fieldset
        disabled={state.kind === "uploading" || state.kind === "done"}
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={inputId} className="eyebrow text-xs">
            {labels.button}
          </label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={allowedTypes.join(",")}
            aria-describedby={`${inputId}-help`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setState({ kind: "idle" });
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
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
        <button type="submit" className="boton-calido self-start">
          {labels.button}
        </button>
      </fieldset>
      <output className="block text-sm font-semibold" aria-live="polite">
        {state.kind === "uploading" ? labels.uploading.replace("{nombre}", state.name) : null}
        {state.kind === "done" ? labels.done : null}
        {state.kind === "error" ? (
          <span
            role="alert"
            className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy"
          >
            {state.message}
          </span>
        ) : null}
      </output>
    </ActionForm>
  );
}
