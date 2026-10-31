"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { mediaUrl } from "@/shared/lib/media";
import { ActionForm } from "@/shared/ui/ActionForm";
import { uploadToBucket } from "@/shared/ui/bucket-upload";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";

// Foto propia (ADR-034 regla 8): selección local → confirmación explícita → subida directa al bucket
// (`uploadToBucket`, ADR-121 regla 14). El servidor vuelve a comprobar su propiedad.

type Labels = {
  field: string;
  button: string;
  help: string;
  remove: string;
  uploading: string;
  done: string;
  errorFile: string;
  errorUpload: string;
  alt: string;
  choose: string;
  replace: string;
  clear: string;
  selected: string;
  preview: string;
  removing: string;
  removed: string;
};

type Props = {
  currentAssetId: string | null;
  allowedTypes: string[];
  minBytes: number;
  maxBytes: number;
  labels: Labels;
  onChange: (assetId: string | null) => Promise<{ ok: boolean; error?: string }>;
};

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "removing" }
  | { kind: "done" }
  | { kind: "removed" }
  | { kind: "error"; message: string };

export function PhotoUploader({
  currentAssetId,
  allowedTypes,
  minBytes,
  maxBytes,
  labels,
  onChange,
}: Props) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "uploading" || state.kind === "removing";
  const valid = (candidate: File) =>
    allowedTypes.includes(candidate.type) &&
    candidate.size <= maxBytes &&
    candidate.size >= minBytes;

  useEffect(() => {
    if (!file || !allowedTypes.includes(file.type)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, allowedTypes]);

  function clearSelection() {
    setFile(null);
    if (input.current) input.current.value = "";
    setState({ kind: "idle" });
  }

  async function upload() {
    if (inFlight.current || !file) return;
    if (!valid(file)) {
      setState({ kind: "error", message: labels.errorFile });
      input.current?.focus();
      return;
    }
    inFlight.current = true;
    setState({ kind: "uploading", name: file.name });
    try {
      const { confirmation } = await uploadToBucket(file, {
        presign: {
          url: "/api/media/presign",
          body: {
            filename: file.name,
            contentType: file.type,
            byteSize: file.size,
            visibility: "PRIVATE",
            purpose: "photo",
          },
        },
        confirm: {
          url: "/api/media/confirm",
          body: { filename: file.name, visibility: "PRIVATE", purpose: "photo" },
        },
      });
      const { id } = (await confirmation.json()) as { id: string };
      const result = await onChange(id);
      if (!result.ok) throw new UploadError(result.error ?? labels.errorUpload);
      clearSelection();
      setState({ kind: "done" });
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setState({
        kind: "error",
        message: uploadErrorMessage(error, labels.errorUpload),
      });
    } finally {
      inFlight.current = false;
    }
  }

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: "removing" });
    try {
      const result = await onChange(null);
      if (!result.ok) throw new UploadError(result.error ?? labels.errorUpload);
      setState({ kind: "removed" });
      router.refresh();
    } catch (error) {
      unstable_rethrow(error);
      setState({
        kind: "error",
        message: uploadErrorMessage(error, labels.errorUpload),
      });
    } finally {
      inFlight.current = false;
    }
  }

  const image = preview ?? (currentAssetId ? mediaUrl(currentAssetId, 480) : null);
  return (
    <ActionForm
      aria-label={labels.field}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void upload();
      }}
      className="flex flex-col gap-4"
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        <legend className="mb-3 font-bold">{labels.field}</legend>
        <div className="flex flex-wrap items-start gap-5">
          {image ? (
            // biome-ignore lint/performance/noImgElement: vista previa local o URL de medio privado (ADR-022)
            <img
              src={image}
              alt={preview ? labels.preview : labels.alt}
              width={96}
              height={96}
              className="size-24 shrink-0 rounded-full border border-borde object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="size-24 shrink-0 rounded-full border border-borde bg-fondo-suave"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <label htmlFor={inputId} className="sr-only">
              {labels.field}
            </label>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={allowedTypes.join(",")}
              aria-describedby={`${inputId}-help ${inputId}-selection`}
              aria-invalid={file && !valid(file) ? true : undefined}
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (!selected) return;
                setFile(selected);
                setState(
                  valid(selected) ? { kind: "idle" } : { kind: "error", message: labels.errorFile },
                );
              }}
              className="sr-only"
              tabIndex={-1}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="boton-secundario text-sm"
              >
                {file ? labels.replace : labels.choose}
              </button>
              {file ? (
                <button type="button" onClick={clearSelection} className="boton-secundario text-sm">
                  {labels.clear}
                </button>
              ) : null}
            </div>
            <p
              id={`${inputId}-selection`}
              className="min-w-0 break-words text-sm"
              aria-live="polite"
            >
              {file
                ? `${file.name} · ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(file.size / 1024)} KB`
                : labels.selected}
            </p>
          </div>
        </div>
        <p id={`${inputId}-help`} className="max-w-prose text-sm text-tinta-suave">
          {labels.help}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!file || !valid(file)}
            className="boton-primario self-start"
          >
            {labels.button}
          </button>
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
      </fieldset>
      <div aria-live="polite" aria-atomic="true" className="text-sm font-semibold">
        {state.kind === "uploading" ? labels.uploading.replace("{nombre}", state.name) : null}
        {state.kind === "removing" ? labels.removing : null}
        {state.kind === "done" ? labels.done : null}
        {state.kind === "removed" ? labels.removed : null}
        {state.kind === "error" ? (
          <p role="alert" className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy">
            {state.message}
          </p>
        ) : null}
      </div>
    </ActionForm>
  );
}
