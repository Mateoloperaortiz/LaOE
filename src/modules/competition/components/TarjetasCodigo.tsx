"use client";

import { useActionState } from "react";

// Emisión de los códigos de equipo (ADR-089 regla 3): la acción los devuelve una sola vez y aquí se
// arman las tarjetas para imprimir. No viajan en una URL ni quedan guardados en el navegador.

export interface IssuedCodeView {
  teamId: string;
  number: number;
  name: string;
  code: string;
}

type State = { codes: IssuedCodeView[]; error: string | null };

type Props = {
  competitionId: string;
  action: (state: State, form: FormData) => Promise<State>;
  labels: {
    missing: string;
    all: string;
    warning: string;
    card: string; // con {n} y {nombre}
    print: string;
    pending: string;
  };
};

function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function TarjetasCodigo({ competitionId, action, labels }: Props) {
  const [state, submit, pending] = useActionState(action, { codes: [], error: null });
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-tinta-suave">{labels.warning}</p>
      <form action={submit} className="flex flex-wrap gap-3 print:hidden">
        <input type="hidden" name="competitionId" value={competitionId} />
        <button
          type="submit"
          className="boton-secundario"
          name="scope"
          value="missing"
          disabled={pending}
        >
          {pending ? labels.pending : labels.missing}
        </button>
        <button
          type="submit"
          className="boton-secundario"
          name="scope"
          value="all"
          disabled={pending}
        >
          {labels.all}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-oe-orange">
          {state.error}
        </p>
      ) : null}
      {state.codes.length > 0 ? (
        <>
          <button
            type="button"
            className="boton-primario self-start print:hidden"
            onClick={() => window.print()}
          >
            {labels.print}
          </button>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 print:grid-cols-2">
            {state.codes.map((item) => (
              <li
                key={item.teamId}
                className="flex break-inside-avoid flex-col gap-2 rounded-xl border-2 border-dashed border-borde p-4"
              >
                <span className="text-sm font-semibold">
                  {labels.card.replace("{n}", String(item.number)).replace("{nombre}", item.name)}
                </span>
                <span className="font-mono text-2xl tracking-widest">{formatCode(item.code)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
