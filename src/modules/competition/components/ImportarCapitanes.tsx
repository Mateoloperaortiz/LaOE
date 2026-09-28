"use client";

import { useActionState } from "react";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { Issues } from "./ImportarJornada";

// Cargar los capitanes pegando tres columnas de la hoja de la OE (ADR-095). Si la casa encuentra
// problemas, lo pegado se conserva para corregirlo sin volver a copiarlo. Si la carga sale bien, la
// acción vuelve a Equipos con el aviso.

export interface ImportCaptainsState {
  errors: string[];
  text: string;
  attempt: number;
}

const IMPORT_CAPTAINS_IDLE: ImportCaptainsState = { errors: [], text: "", attempt: 0 };

type Props = {
  competitionId: string;
  action: (state: ImportCaptainsState, form: FormData) => Promise<ImportCaptainsState>;
  labels: {
    title: string;
    help: string;
    sheet: string;
    submit: string;
    pending: string;
    blocked: string;
    /** Con {n}. */
    more: string;
  };
};

export function ImportarCapitanes({ competitionId, action, labels }: Props) {
  const [state, submit, pending] = useActionState(action, IMPORT_CAPTAINS_IDLE);
  return (
    <details className="rounded-xl border border-borde p-4" open={state.attempt > 0}>
      <summary className="cursor-pointer font-semibold">{labels.title}</summary>
      <form key={state.attempt} action={submit} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="competitionId" value={competitionId} />
        <p id="capitanes-ayuda" className="max-w-prose text-sm text-tinta-suave">
          {labels.help}
        </p>
        <label htmlFor="capitanes-hoja" className="flex flex-col gap-1">
          <span className="font-semibold">{labels.sheet}</span>
          <textarea
            id="capitanes-hoja"
            name="text"
            required
            rows={8}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="capitanes-ayuda"
            defaultValue={state.text}
            className={`${inputClass} font-mono text-sm`}
          />
        </label>
        {state.errors.length > 0 ? (
          <div role="alert" className="flex flex-col gap-2 text-oe-orange">
            <p className="font-semibold">{labels.blocked}</p>
            <Issues items={state.errors} more={labels.more} />
          </div>
        ) : null}
        <button type="submit" className="boton-primario min-h-11 self-start" disabled={pending}>
          {pending ? labels.pending : labels.submit}
        </button>
      </form>
    </details>
  );
}
