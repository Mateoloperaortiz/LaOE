"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

// Subida de un PDF de normativa (ADR-034 regla 9): título, tipo, versión y audiencia, luego
// presign → POST al bucket → confirm. Los bytes no pasan por la app (ADR-022).

type Labels = {
  /** Título · Tipo · Versión · Audiencia · Archivo PDF (T-494). */
  fields: string[];
  kinds: string[];
  audiences: [string, string];
  help: string;
  uploading: string; // con {nombre}
  done: string;
  errorType: string;
  errorSize: string;
  errorUpload: string;
  errorTitle: string;
  submit: string;
  errorFile: string;
  chooseFile: string;
  noFile: string;
  replaceFile: string;
  removeFile: string;
};

type Props = {
  kindCodes: readonly string[];
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

const inputClass =
  "rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export function DocumentUploader({ kindCodes, minBytes, maxBytes, labels }: Props) {
  const router = useRouter();
  const base = useId();
  const uploading = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(kindCodes[0] ?? "OTRO");
  const [version, setVersion] = useState("");
  const [audience, setAudience] = useState<"PUBLIC" | "MEMBERS">("MEMBERS");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [tituloL, tipoL, versionL, audienciaL, archivoL] = labels.fields;

  async function upload(file: File) {
    if (uploading.current) return;
    if (title.trim().length < 2 || version.trim().length === 0) {
      setState({ kind: "error", message: labels.errorTitle });
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
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
      const presign = await fetch("/api/documentos/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, byteSize: file.size }),
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
      const confirm = await fetch("/api/documentos/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: prepared.key,
          filename: file.name,
          title: title.trim(),
          kind,
          version: version.trim(),
          audience,
        }),
      });
      if (!confirm.ok) {
        throw new Error(await readError(confirm, labels.errorUpload));
      }
      const result = (await confirm.json()) as { id: string };
      setState({ kind: "done" });
      router.push(`/admin/documentos/${result.id}?subido=1`);
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : labels.errorUpload,
      });
    } finally {
      uploading.current = false;
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (file) void upload(file);
        else setState({ kind: "error", message: labels.errorFile });
      }}
      className="admin-upload flex min-w-0 flex-col gap-5"
      aria-busy={state.kind === "uploading"}
    >
      <p id={`${base}-help`} className="text-sm text-tinta-suave">
        {labels.help}
      </p>
      <fieldset
        disabled={state.kind === "uploading" || state.kind === "done"}
        className="grid min-w-0 gap-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${base}-title`} className="eyebrow text-xs">
            {tituloL}
          </label>
          <input
            id={`${base}-title`}
            value={title}
            required
            minLength={2}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            className={`${inputClass} w-full min-w-0`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${base}-kind`} className="eyebrow text-xs">
            {tipoL}
          </label>
          <select
            id={`${base}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className={inputClass}
          >
            {kindCodes.map((code, index) => (
              <option key={code} value={code}>
                {labels.kinds[index] ?? code}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${base}-version`} className="eyebrow text-xs">
            {versionL}
          </label>
          <input
            id={`${base}-version`}
            value={version}
            required
            maxLength={60}
            onChange={(event) => setVersion(event.target.value)}
            className={`${inputClass} w-full min-w-0`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${base}-audience`} className="eyebrow text-xs">
            {audienciaL}
          </label>
          <select
            id={`${base}-audience`}
            value={audience}
            onChange={(event) =>
              setAudience(event.target.value === "PUBLIC" ? "PUBLIC" : "MEMBERS")
            }
            className={inputClass}
          >
            <option value="PUBLIC">{labels.audiences[0]}</option>
            <option value="MEMBERS">{labels.audiences[1]}</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
          <label htmlFor={`${base}-file`} className="eyebrow text-xs">
            {archivoL}
          </label>
          <input
            ref={input}
            id={`${base}-file`}
            type="file"
            accept="application/pdf,.pdf"
            aria-describedby={`${base}-help`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setState({ kind: "idle" });
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={`${base}-file`}
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
        <button type="submit" className="boton-calido justify-self-start sm:col-span-2">
          {labels.submit}
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
    </form>
  );
}
