"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type CopyCode, t, tList } from "@/shared/copy";
import { XIcon } from "@/shared/ui/icons/XIcon";
import type { ChallengeSubmitReply, SubmitDenial } from "../gamification-types";

// Evidencia de una misión (ADR-067 reglas 5 y 6): texto acotado y hasta tres imágenes que suben
// directo al bucket con presign; el requestId de sessionStorage hace el envío idempotente.

const ERROR_COPY: Record<SubmitDenial, CopyCode> = {
  DISABLED: "T-2442",
  NOT_FOUND: "T-2441",
  NOT_OPEN: "T-2438",
  NOT_ELIGIBLE: "T-2440",
  ALREADY: "T-2439",
  TERM_CLOSED: "T-2443",
  INVALID_INPUT: "T-2426",
  REQUEST_CONFLICT: "T-2444",
  INCOMPLETE: "T-2426",
};

interface PreparedUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
}

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

async function uploadFile(file: File): Promise<string> {
  const presign = await fetch("/api/retos/evidencia/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, byteSize: file.size }),
  });
  if (!presign.ok) {
    throw new Error("presign");
  }
  const prepared = (await presign.json()) as PreparedUpload;
  const form = new FormData();
  for (const [name, value] of Object.entries(prepared.fields)) {
    form.append(name, value);
  }
  form.append("file", file, file.name);
  const stored = await fetch(prepared.url, { method: "POST", body: form });
  if (!stored.ok) {
    throw new Error("bucket");
  }
  return prepared.key;
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
}: {
  challengeId: string;
  textMin: number;
  textMax: number;
  maxFiles: number;
  minBytes: number;
  maxBytes: number;
  allowedTypes: string[];
  onSubmit: (input: unknown) => Promise<ChallengeSubmitReply>;
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

  async function addFile(file: File) {
    setMessage("");
    if (files.length >= maxFiles) {
      setMessage(errors[2] ?? "");
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      setMessage(errors[0] ?? "");
      return;
    }
    if (file.size < minBytes || file.size > maxBytes) {
      setMessage(errors[1] ?? "");
      return;
    }
    setUploading(true);
    try {
      const key = await uploadFile(file);
      setFiles((current) => [
        ...current,
        { key, preview: URL.createObjectURL(file), name: file.name },
      ]);
    } catch {
      setMessage(errors[3] ?? "");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function submit() {
    if (pending || uploading || !requestId) {
      return;
    }
    if (!textValid) {
      setMessage(t("T-2426"));
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
        setMessage(t("T-2426"));
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
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
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
