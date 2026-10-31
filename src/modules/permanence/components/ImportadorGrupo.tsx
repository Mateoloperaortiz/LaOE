"use client";

import { ActionForm } from "@/shared/ui/ActionForm";

import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";

// Importación de miembros a un grupo desde un CSV de correos (ADR-036 regla 6): dos pasos en el
// cliente (vista previa y confirmación) sin guardar nada hasta confirmar; el CSV viaja como texto.

export interface ImportState {
  csv: string;
  rows: Array<{ email: string; name: string; outcome: "ADD" | "ALREADY" | "INACTIVE" | "UNKNOWN" }>;
  summary: { add: number; already: number; inactive: number; unknown: number } | null;
  error: string | null;
  applied: number | null;
}

export type ImportAction = (previous: ImportState, formData: FormData) => Promise<ImportState>;

type Props = {
  groupId: string;
  action: ImportAction;
  labels: {
    help: string;
    load: string;
    confirm: string;
    /** T-754 con {n}, {m}, {k} y {j}. */
    summary: string;
    outcomes: Record<ImportState["rows"][number]["outcome"], string>;
    /** T-845 con {n}. */
    applied: string;
  };
};

export const EMPTY_IMPORT: ImportState = {
  csv: "",
  rows: [],
  summary: null,
  error: null,
  applied: null,
};

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{([a-z])\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export function ImportadorGrupo({ groupId, action, labels }: Props) {
  const [state, formAction, pending] = useGuardedActionState(
    action,
    EMPTY_IMPORT,
    ({ previous, message }) => ({ ...previous, error: message, applied: null }),
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tinta-suave">{labels.help}</p>
      {state.error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {state.error}
        </p>
      ) : null}
      {state.applied !== null ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {fill(labels.applied, { n: state.applied })}
        </output>
      ) : null}
      <ActionForm action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="step" value="preview" />
        <label htmlFor="archivo" className="eyebrow text-xs">
          CSV
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".csv,text/csv"
          className={inputClass}
        />
        <button type="submit" disabled={pending} className="boton-secundario self-start">
          {labels.load}
        </button>
      </ActionForm>
      {state.summary ? (
        <ActionForm action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="step" value="apply" />
          <input type="hidden" name="csv" value={state.csv} />
          <p className="font-semibold">
            {fill(labels.summary, {
              n: state.summary.add,
              m: state.summary.already,
              k: state.summary.inactive,
              j: state.summary.unknown,
            })}
          </p>
          <ul className="flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0 text-sm">
            {state.rows.map((row) => (
              <li key={row.email} className="flex justify-between gap-3">
                <span>{row.name || row.email}</span>
                <span className="text-tinta-suave">{labels.outcomes[row.outcome]}</span>
              </li>
            ))}
          </ul>
          {state.summary.add > 0 ? (
            <button type="submit" disabled={pending} className="boton-calido self-start">
              {labels.confirm}
            </button>
          ) : null}
        </ActionForm>
      ) : null}
    </div>
  );
}
