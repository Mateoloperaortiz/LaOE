"use client";

import { inputClass } from "@/shared/admin-kit/AdminFields";
import { ActionForm } from "@/shared/ui/ActionForm";
import { submittedText, useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { Issues } from "./ImportarJornada";

// Cargar las notas de un jurado de The Challenge pegando su tabla (ADR-103). Si la casa encuentra
// problemas, lo pegado y el nombre se conservan para corregirlos; si sale bien, la acción vuelve a
// Extras con el aviso. Todos los textos llegan del servidor.

export interface ImportJuryState {
  errors: string[];
  judge: string;
  text: string;
  attempt: number;
}

const IMPORT_JURY_IDLE: ImportJuryState = { errors: [], judge: "", text: "", attempt: 0 };

type Props = {
  competitionId: string;
  extraId: string;
  action: (state: ImportJuryState, form: FormData) => Promise<ImportJuryState>;
  labels: {
    help: string;
    judge: string;
    sheet: string;
    submit: string;
    pending: string;
    blocked: string;
    /** Con {n}. */
    more: string;
  };
};

export function ImportarJurado({ competitionId, extraId, action, labels }: Props) {
  const [state, submit, pending] = useGuardedActionState(
    action,
    IMPORT_JURY_IDLE,
    ({ previous, payload, message }) => ({
      ...previous,
      attempt: previous.attempt + 1,
      errors: [message],
      judge: submittedText(payload, "judge"),
      text: submittedText(payload, "text"),
    }),
  );
  const id = `jurado-${extraId}`;
  return (
    <ActionForm key={state.attempt} action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="competitionId" value={competitionId} />
      <input type="hidden" name="extraId" value={extraId} />
      <p id={`${id}-ayuda`} className="max-w-prose text-sm text-tinta-suave">
        {labels.help}
      </p>
      <label htmlFor={`${id}-nombre`} className="flex max-w-sm flex-col gap-1">
        <span className="font-semibold">{labels.judge}</span>
        <input
          id={`${id}-nombre`}
          name="judge"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={state.judge}
          className={inputClass}
        />
      </label>
      <label htmlFor={`${id}-hoja`} className="flex flex-col gap-1">
        <span className="font-semibold">{labels.sheet}</span>
        <textarea
          id={`${id}-hoja`}
          name="text"
          required
          rows={8}
          spellCheck={false}
          autoComplete="off"
          aria-describedby={`${id}-ayuda`}
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
    </ActionForm>
  );
}
