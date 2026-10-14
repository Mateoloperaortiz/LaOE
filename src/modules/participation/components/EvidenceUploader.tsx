"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type ClientCopyCode, t, tList } from "@/shared/copy/client";
import { uploadToBucket } from "@/shared/ui/bucket-upload";
import { XIcon } from "@/shared/ui/icons/XIcon";
import type { ChallengeSubmitReply, SubmitDenial } from "../gamification-types";

// Evidencia de una misión (ADR-067 reglas 5 y 6): texto acotado y hasta tres imágenes que suben
// directo al bucket con presign y sin confirmación (`uploadToBucket`, ADR-121 regla 14); el
// requestId de sessionStorage hace el envío idempotente. La imagen que se quita de la lista se borra
// del bucket (ADR-122 regla 20).

const ERROR_COPY: Record<SubmitDenial, ClientCopyCode> = {
  DISABLED: "T-2442",
  NOT_FOUND: "T-2441",
  NOT_OPEN: "T-2438",
  NOT_ELIGIBLE: "T-2440",
  ALREADY: "T-2439",
  TERM_CLOSED: "T-2443",
  // El formulario no tiene preguntas: ninguno de sus rechazos pinta el texto de la trivia (ADR-122
  // regla 16). `INCOMPLETE` es de la trivia y acá no llega; el tipo pide todas las razones.
  INVALID_INPUT: "T-3262",
  REQUEST_CONFLICT: "T-2444",
  INCOMPLETE: "T-3262",
};

interface UploadedFile {
  key: string;
  preview: string;
  name: string;
}

function Preview({ src, name }: { src: string; name: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: la miniatura es un blob local, no un recurso servido
    <img src={src} alt={name} className="size-24 rounded-lg border border-borde object-cover" />
  );
}

export function EvidenceUploader({
  challengeId,
  textMin,
  textMax,
  maxFiles,
  minBytes,
  maxBytes,
  allowedTypes,
  onSubmit,
  onDiscard,
}: {
  challengeId: string;
  textMin: number;
  textMax: number;
  maxFiles: number;
  minBytes: number;
  maxBytes: number;
  allowedTypes: string[];
  onSubmit: (input: unknown) => Promise<ChallengeSubmitReply>;
  onDiscard: (input: unknown) => Promise<void>;
}) {
  const router = useRouter();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const errors = tList("T-2430");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [reply, setReply] = useState<ChallengeSubmitReply | null>(null);
  const [pending, startTransition] = useTransition();
  const cleanText = text.trim();
  const textValid = cleanText.length >= textMin && cleanText.length <= textMax;

  useEffect(() => {
    const key = `reto:${challengeId}:request`;
    const existing = sessionStorage.getItem(key);
    if (existing) {
      setRequestId(existing);
    } else {
      const id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
      setRequestId(id);
    }
  }, [challengeId]);

  useEffect(() => {
    const previews = files.map((file) => file.preview);
    return () => {
      for (const url of previews) {
        URL.revokeObjectURL(url);
      }
    };
  }, [files]);

  /** Por qué ese archivo no se sube, o `null` si entra. Cada borde del tamaño dice el suyo. */
  function rejectionOf(file: File): string | null {
    if (files.length >= maxFiles) return errors[2] ?? "";
    if (!allowedTypes.includes(file.type)) return errors[0] ?? "";
    if (file.size < minBytes) return t("T-3264");
    if (file.size > maxBytes) return errors[1] ?? "";
    return null;
  }

  // El selector queda vacío también al rechazar (ADR-122 regla 18): con el archivo puesto, volver a
  // elegir ese mismo no dispara `change` y no avisa.
  function clearPicker() {
    if (fileInput.current) fileInput.current.value = "";
  }

  async function addFile(file: File) {
    setMessage("");
    const rejection = rejectionOf(file);
    if (rejection !== null) {
      setMessage(rejection);
      clearPicker();
      return;
    }
    setUploading(true);
    try {
      const { key } = await uploadToBucket(file, {
        presign: {
          url: "/api/retos/evidencia/presign",
          body: { contentType: file.type, byteSize: file.size },
        },
      });
      setFiles((current) => [
        ...current,
        { key, preview: URL.createObjectURL(file), name: file.name },
      ]);
    } catch {
      // Cualquier fallo lleva el texto de la evidencia: lo que diga la casa no se repite acá.
      setMessage(errors[3] ?? "");
    } finally {
      setUploading(false);
      clearPicker();
    }
  }

  // La imagen sale de la lista sin esperar a la casa, que borra el objeto. Si la acción se rechaza,
  // la pantalla sigue y el objeto queda en el bucket, como quedaba antes de la regla 20.
  function removeFile(index: number, key: string) {
    setFiles((current) => current.filter((_, i) => i !== index));
    void onDiscard({ key }).catch(() => undefined);
  }

  function submit() {
    if (pending || uploading || !requestId) {
      return;
    }
    if (!textValid) {
      setMessage(t("T-3261", { min: textMin, max: textMax }));
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result = await onSubmit({
          challengeId,
          requestId,
          text: cleanText,
          keys: files.map((file) => file.key),
        });
        setReply(result);
        if (result.ok) {
          router.refresh();
        } else {
          setMessage(t(ERROR_COPY[result.reason]));
        }
      } catch {
        // La acción no respondió (ADR-118 regla 21): no es que falten respuestas.
        setMessage(t("T-3253"));
      }
    });
  }

  if (reply?.ok) {
    return (
      <output className="block font-semibold" aria-live="polite">
        {t("T-2431")}
      </output>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-busy={pending || uploading}
      className="flex flex-col gap-5"
    >
      <p id={`${inputId}-help`} className="text-sm text-tinta-suave">
        {t("T-2427", { min: textMin, max: textMax })}
      </p>
      <label htmlFor={inputId} className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{t("T-2428")}</span>
        <textarea
          id={inputId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          minLength={textMin}
          maxLength={textMax}
          rows={4}
          required
          aria-describedby={`${inputId}-help ${inputId}-count`}
          className="w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
        />
        <span id={`${inputId}-count`} className="text-xs text-tinta-suave">
          {cleanText.length} / {textMin}–{textMax}
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <label
          className={`boton-secundario inline-block min-h-9 cursor-pointer px-4 py-1 text-sm ${uploading ? "opacity-60" : ""}`}
        >
          <span aria-hidden="true">{t("T-2429")}</span>
          <input
            ref={fileInput}
            type="file"
            accept={allowedTypes.join(",")}
            capture="environment"
            disabled={uploading || files.length >= maxFiles}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void addFile(file);
            }}
            className="sr-only"
          />
        </label>
        {files.length > 0 ? (
          <ul className="flex list-none flex-wrap gap-3 p-0">
            {files.map((file, index) => (
              <li key={file.key} className="flex flex-col items-start gap-1">
                <Preview src={file.preview} name={file.name} />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-semibold underline"
                  onClick={() => removeFile(index, file.key)}
                >
                  <XIcon />
                  {t("T-1489")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <output className="block min-h-6 text-sm font-semibold" aria-live="polite" aria-atomic="true">
        {pending ? tList("T-2410")[1] : null}
        {message ? (
          <span
            role="alert"
            className="inline-block rounded-lg bg-oe-orange px-2 py-1 text-oe-navy"
          >
            {message}
          </span>
        ) : null}
      </output>
      <button
        type="submit"
        disabled={pending || uploading || !requestId}
        className="boton-primario self-start disabled:opacity-60"
      >
        {tList("T-2420")[2]}
      </button>
    </form>
  );
}
