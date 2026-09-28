"use client";

import { useActionState } from "react";
import { inputClass } from "@/shared/admin-kit/AdminFields";

// Importar una jornada pegando la hoja de rotaciones de la OE (ADR-094). Si la casa encuentra
// errores o advertencias, la hoja pegada se conserva para corregirla o confirmarla sin volver a
// copiarla. Si la importación sale bien, la acción vuelve a Rotaciones con el aviso.

export interface ImportDayState {
  errors: string[];
  warnings: string[];
  text: string;
  minutes: string;
  attempt: number;
}

const IMPORT_DAY_IDLE: ImportDayState = {
  errors: [],
  warnings: [],
  text: "",
  minutes: "",
  attempt: 0,
};

type Props = {
  competitionId: string;
  day: 1 | 2;
  action: (state: ImportDayState, form: FormData) => Promise<ImportDayState>;
  labels: {
    title: string;
    help: string;
    sheet: string;
    minutes: string;
    submit: string;
    pending: string;
    confirm: string;
    blocked: string;
    warned: string;
    /** Con {n}. */
    more: string;
  };
};

const SHOWN = 20;

/** La lista de problemas de una hoja pegada, con las primeras 20 y cuántas más hay. */
export function Issues({ items, more }: { items: string[]; more: string }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
      {items.slice(0, SHOWN).map((item) => (
        <li key={item}>{item}</li>
      ))}
      {items.length > SHOWN ? (
        <li className="list-none">{more.replace("{n}", String(items.length - SHOWN))}</li>
      ) : null}
    </ul>
  );
}

export function ImportarJornada({ competitionId, day, action, labels }: Props) {
  const [state, submit, pending] = useActionState(action, IMPORT_DAY_IDLE);
  const id = `importar-${day}`;
  return (
    <details className="rounded-xl border border-borde p-4" open={state.attempt > 0}>
      <summary className="cursor-pointer font-semibold">{labels.title}</summary>
      <form key={state.attempt} action={submit} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="competitionId" value={competitionId} />
        <input type="hidden" name="day" value={String(day)} />
        <p id={`${id}-ayuda`} className="max-w-prose text-sm text-tinta-suave">
          {labels.help}
        </p>
        <label htmlFor={`${id}-hoja`} className="flex flex-col gap-1">
          <span className="font-semibold">{labels.sheet}</span>
          <textarea
            id={`${id}-hoja`}
            name="text"
            required
            rows={8}
            spellCheck={false}
            aria-describedby={`${id}-ayuda`}
            defaultValue={state.text}
            className={`${inputClass} font-mono text-sm`}
          />
        </label>
        <label htmlFor={`${id}-minutos`} className="flex flex-col gap-1 self-start">
          <span className="font-semibold">{labels.minutes}</span>
          <input
            id={`${id}-minutos`}
            name="plannedMinutes"
            type="number"
            min={1}
            max={240}
            required
            defaultValue={state.minutes}
            className={`${inputClass} w-28`}
          />
        </label>
        {state.errors.length > 0 ? (
          <div role="alert" className="flex flex-col gap-2 text-oe-orange">
            <p className="font-semibold">{labels.blocked}</p>
            <Issues items={state.errors} more={labels.more} />
          </div>
        ) : null}
        {state.warnings.length > 0 ? (
          <div role="alert" className="flex flex-col gap-2">
            <p className="font-semibold">{labels.warned}</p>
            <Issues items={state.warnings} more={labels.more} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirmWarnings" className="size-5" />
              <span>{labels.confirm}</span>
            </label>
          </div>
        ) : null}
        <button type="submit" className="boton-primario min-h-11 self-start" disabled={pending}>
          {pending ? labels.pending : labels.submit}
        </button>
      </form>
    </details>
  );
}
