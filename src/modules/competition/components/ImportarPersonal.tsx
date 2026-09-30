"use client";

import { useActionState, useState } from "react";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { Issues } from "./ImportarJornada";

// Cargar el personal de una jornada desde la hoja del GAP (ADR-101): se elige la jornada, se pegan
// las columnas Persona, Base y Función y se revisa. La revisión muestra cada base con su gente, los
// nombres que la hoja trae incompletos, quiénes salen y los avisos; «Guardar» manda la huella de esa
// revisión. Si se cambia lo pegado o la jornada, hay que revisar otra vez. Todos los textos llegan
// del servidor.

export interface StaffPreviewState {
  summary: string;
  changes: string;
  warnings: string[];
  partial: string[];
  removals: string[];
  bases: Array<{
    name: string;
    location: string | null;
    roles: Array<{ label: string; names: string }>;
  }>;
  /** Hay algo que guardar: si la jornada ya tiene ese personal, no se ofrece «Guardar». */
  canSave: boolean;
  save: string;
}

export interface ImportStaffState {
  attempt: number;
  day: "1" | "2";
  text: string;
  errors: string[];
  notice: string | null;
  fingerprint: string | null;
  preview: StaffPreviewState | null;
}

const IMPORT_STAFF_IDLE: ImportStaffState = {
  attempt: 0,
  day: "1",
  text: "",
  errors: [],
  notice: null,
  fingerprint: null,
  preview: null,
};

type Props = {
  competitionId: string;
  action: (state: ImportStaffState, form: FormData) => Promise<ImportStaffState>;
  labels: {
    title: string;
    help: string;
    sheet: string;
    day: string;
    /** Jueves y viernes. */
    days: string[];
    review: string;
    pending: string;
    blocked: string;
    /** Con {n}. */
    more: string;
    partial: string;
    removals: string;
  };
};

function Preview({ preview, labels }: { preview: StaffPreviewState; labels: Props["labels"] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold">{preview.summary}</p>
      <p className="text-sm text-tinta-suave">{preview.changes}</p>
      {preview.warnings.length > 0 ? (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-oe-orange">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {preview.partial.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{labels.partial}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
            {preview.partial.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.removals.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{labels.removals}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
            {preview.removals.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="m-0 flex list-none flex-col divide-y divide-borde p-0 text-sm">
        {preview.bases.map((base) => (
          <li key={base.name} className="flex flex-col gap-1 py-2">
            <p className="font-semibold">
              {base.name}
              {base.location ? (
                <span className="font-normal text-tinta-suave"> · {base.location}</span>
              ) : null}
            </p>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {base.roles.map((role) => (
                <div key={role.label} className="contents">
                  <dt className="text-tinta-suave">{role.label}</dt>
                  <dd className="m-0">{role.names}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StaffForm({
  competitionId,
  state,
  submit,
  pending,
  labels,
}: {
  competitionId: string;
  state: ImportStaffState;
  submit: (form: FormData) => void;
  pending: boolean;
  labels: Props["labels"];
}) {
  // Lo revisado vale solo para lo que se pegó y la jornada elegida: si cambian, se revisa otra vez.
  const [dirty, setDirty] = useState(false);
  const preview = dirty ? null : state.preview;
  return (
    <form action={submit} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="fingerprint" value={dirty ? "" : (state.fingerprint ?? "")} />
      <p id="personal-ayuda" className="max-w-prose text-sm text-tinta-suave">
        {labels.help}
      </p>
      <label htmlFor="personal-jornada" className="flex max-w-xs flex-col gap-1">
        <span className="font-semibold">{labels.day}</span>
        <select
          id="personal-jornada"
          name="day"
          defaultValue={state.day}
          onChange={() => setDirty(true)}
          className={inputClass}
        >
          {labels.days.map((label, index) => (
            <option key={label} value={String(index + 1)}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="personal-hoja" className="flex flex-col gap-1">
        <span className="font-semibold">{labels.sheet}</span>
        <textarea
          id="personal-hoja"
          name="text"
          required
          rows={10}
          spellCheck={false}
          autoComplete="off"
          aria-describedby="personal-ayuda"
          defaultValue={state.text}
          onChange={() => setDirty(true)}
          className={`${inputClass} font-mono text-sm`}
        />
      </label>
      {state.errors.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 text-oe-orange">
          <p className="font-semibold">{labels.blocked}</p>
          <Issues items={state.errors} more={labels.more} />
        </div>
      ) : null}
      {state.notice && !dirty ? (
        <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {state.notice}
        </output>
      ) : null}
      {preview ? <Preview preview={preview} labels={labels} /> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="preview"
          className={`${preview?.canSave ? "boton-secundario" : "boton-primario"} min-h-11`}
          disabled={pending}
        >
          {pending ? labels.pending : labels.review}
        </button>
        {preview?.canSave ? (
          <button
            type="submit"
            name="intent"
            value="apply"
            className="boton-primario min-h-11"
            disabled={pending}
          >
            {preview.save}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ImportarPersonal({ competitionId, action, labels }: Props) {
  const [state, submit, pending] = useActionState(action, IMPORT_STAFF_IDLE);
  return (
    <details className="rounded-xl border border-borde p-4" open={state.attempt > 0}>
      <summary className="cursor-pointer font-semibold">{labels.title}</summary>
      <StaffForm
        key={state.attempt}
        competitionId={competitionId}
        state={state}
        submit={submit}
        pending={pending}
        labels={labels}
      />
    </details>
  );
}
