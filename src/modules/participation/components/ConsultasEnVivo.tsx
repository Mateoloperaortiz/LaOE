"use client";

import { useEffect, useState } from "react";
import styles from "./consultas.module.css";

// Las consultas de una asamblea, en vivo por SSE (ADR-179, ADR-180). La misma pieza sirve a la consola
// (abrir y cerrar), al celular de quien vota (votar) y a la pantalla de presentación (solo mirar): cada
// una le pasa sus acciones de servidor. Sin flujo, muestra lo que llegó y la acción recarga la página.

export interface LivePoll {
  id: string;
  question: string;
  options: string[];
  secret: boolean;
  status: "DRAFT" | "OPEN" | "CLOSED";
  voters: number;
  results: Array<{ option: string; votes: number }> | null;
  voted?: boolean;
}

type ServerAction = (formData: FormData) => Promise<void>;

type Props = {
  url: string;
  initial: LivePoll[];
  occasionId: string;
  labels: { statuses: Record<string, string>; votes: string; secret: string; empty: string };
  /** Quien opera: abrir el borrador y cerrar la abierta. */
  operator?: { action: ServerAction; open: string; close: string };
  /** Quien vota: elegir una opción en la abierta, una vez. */
  member?: { action: ServerAction; vote: string; voted: string };
  big?: boolean;
};

function votesText(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

export function ConsultasEnVivo({
  url,
  initial,
  occasionId,
  labels,
  operator,
  member,
  big = false,
}: Props) {
  const [polls, setPolls] = useState(initial);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(url);
    source.onmessage = (event) => {
      try {
        setPolls(JSON.parse(event.data) as LivePoll[]);
      } catch {
        // Un evento mal formado no borra lo que se ve.
      }
    };
    return () => source.close();
  }, [url]);

  if (polls.length === 0) {
    return <p className="text-tinta-secundaria">{labels.empty}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-live="polite">
      {polls.map((poll) => {
        const total = poll.results?.reduce((sum, item) => sum + item.votes, 0) ?? poll.voters;
        return (
          <li
            key={poll.id}
            className={styles.consulta}
            data-estado={poll.status}
            data-grande={big ? "true" : undefined}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={styles.pregunta}>{poll.question}</p>
              <span className="etiqueta-corta text-tinta-secundaria">
                {labels.statuses[poll.status] ?? poll.status} ·{" "}
                {votesText(labels.votes, poll.voters)}
              </span>
            </div>
            {poll.results ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {poll.results.map((item) => {
                  const share = total > 0 ? Math.round((item.votes / total) * 100) : 0;
                  return (
                    <li key={item.option} className={styles.opcion}>
                      <span className="flex justify-between gap-3">
                        <span>{item.option}</span>
                        <span className="tabular-nums">{votesText(labels.votes, item.votes)}</span>
                      </span>
                      <span className={styles.barra} aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : poll.secret ? (
              <p className="text-secundario text-tinta-secundaria">{labels.secret}</p>
            ) : null}
            {operator && poll.status !== "CLOSED" ? (
              <form action={operator.action}>
                <input type="hidden" name="occasionId" value={occasionId} />
                <input type="hidden" name="pollId" value={poll.id} />
                <input
                  type="hidden"
                  name="to"
                  value={poll.status === "DRAFT" ? "OPEN" : "CLOSED"}
                />
                <button type="submit" className="boton-primario min-h-11 px-4 py-2 text-sm">
                  {poll.status === "DRAFT" ? operator.open : operator.close}
                </button>
              </form>
            ) : null}
            {member && poll.status === "OPEN" ? (
              poll.voted ? (
                <p className="font-semibold">{member.voted}</p>
              ) : (
                <form action={member.action} className="flex flex-col gap-2">
                  <input type="hidden" name="occasionId" value={occasionId} />
                  <input type="hidden" name="pollId" value={poll.id} />
                  <fieldset className="flex flex-col gap-2">
                    <legend className="sr-only">{poll.question}</legend>
                    {poll.options.map((option, index) => (
                      <label key={option} className={styles.eleccion}>
                        <input type="radio" name="optionIndex" value={index} required />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                  <button type="submit" className="boton-primario min-h-11 self-start px-5 py-2">
                    {member.vote}
                  </button>
                </form>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
