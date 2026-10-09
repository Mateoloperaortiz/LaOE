"use client";

import { inputClass } from "@/shared/admin-kit/AdminFields";
import { submittedText, useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { Issues } from "./ImportarJornada";

// Cargar el reparto de poderes pegando tres columnas: Equipo, Poder y Jornada (ADR-098). Si la casa
// encuentra problemas, lo pegado se conserva para corregirlo sin volver a copiarlo. Si la carga sale
// bien, la acción vuelve a Poderes con el aviso.

export interface ImportPowersState {
  errors: string[];
  text: string;
  attempt: number;
}

const IMPORT_POWERS_IDLE: ImportPowersState = { errors: [], text: "", attempt: 0 };

type Props = {
  competitionId: string;
  action: (state: ImportPowersState, form: FormData) => Promise<ImportPowersState>;
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
  open?: boolean;
};

export function ImportarPoderes({ competitionId, action, labels, open = false }: Props) {
  const [state, submit, pending] = useGuardedActionState(
    action,
    IMPORT_POWERS_IDLE,
    ({ previous, payload, message }) => ({
      ...previous,
      attempt: previous.attempt + 1,
      errors: [message],
      text: submittedText(payload, "text"),
    }),
  );
  return (
    <details className="rounded-xl border border-borde p-4" open={open || state.attempt > 0}>
      <summary className="cursor-pointer font-semibold">{labels.title}</summary>
      <form key={state.attempt} action={submit} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="competitionId" value={competitionId} />
        <p id="poderes-ayuda" className="max-w-prose text-sm text-tinta-suave">
          {labels.help}
        </p>
        <label htmlFor="poderes-hoja" className="flex flex-col gap-1">
          <span className="font-semibold">{labels.sheet}</span>
          <textarea
            id="poderes-hoja"
            name="text"
            required
            rows={8}
            spellCheck={false}
            autoComplete="off"
            aria-describedby="poderes-ayuda"
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
