"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { type ClientCopyCode, t, tList } from "@/shared/copy/client";
import type { ChallengeSubmitReply, SubmitDenial } from "../gamification-types";

// Trivia de un reto en Mi OE (ADR-067 regla 4): un envío, radios accesibles por pregunta y
// requestId estable en sessionStorage para que un reintento sea replay y no doble entrega.

const ERROR_COPY: Record<SubmitDenial, ClientCopyCode> = {
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

export interface TriviaQuestion {
  ordinal: number;
  prompt: string;
  options: string[];
}

export function Trivia({
  challengeId,
  questions,
  passPercent,
  onSubmit,
}: {
  challengeId: string;
  questions: TriviaQuestion[];
  passPercent: number;
  onSubmit: (input: unknown) => Promise<ChallengeSubmitReply>;
}) {
  const router = useRouter();
  const groupId = useId();
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [requestId, setRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<ChallengeSubmitReply | null>(null);
  const [pending, startTransition] = useTransition();
  const answered = answers.every((answer) => answer !== null);

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

  function submit() {
    if (pending || !requestId) {
      return;
    }
    if (!answered) {
      setMessage(t("T-2426"));
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const result = await onSubmit({
          challengeId,
          requestId,
          answers: answers.map((answer) => answer ?? 0),
        });
        setReply(result);
        if (result.ok) {
          router.refresh();
        } else {
          setMessage(t(ERROR_COPY[result.reason]));
        }
      } catch {
        // La acción no respondió (ADR-118 regla 21): no es que falten respuestas.
        setMessage(t("T-3253"));
      }
    });
  }

  if (reply?.ok) {
    return (
      <output className="block font-semibold" aria-live="polite">
        {reply.status === "COMPLETED"
          ? t("T-2422", {
              aciertos: reply.score ?? 0,
              total: reply.total ?? questions.length,
              n: reply.points ?? 0,
            })
          : (reply.reason ?? "")}
      </output>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-busy={pending}
      className="flex flex-col gap-5"
    >
      <p className="text-sm text-tinta-suave">
        {t("T-2418", { n: questions.length, porcentaje: passPercent })}
      </p>
      {questions.map((question, qIndex) => (
        <fieldset key={question.ordinal} className="flex flex-col gap-2">
          <legend className="eyebrow text-xs">
            {t("T-2421", { n: qIndex + 1, total: questions.length })}
          </legend>
          <p className="font-semibold">{question.prompt}</p>
          <div className="flex flex-col gap-1" role="radiogroup">
            {question.options.map((option, oIndex) => (
              <label
                key={`${groupId}-${qIndex + 1}-${oIndex + 1}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-borde bg-fondo px-3 py-2 text-sm has-checked:border-oe-blue has-checked:bg-oe-blue-soft has-checked:text-oe-navy"
              >
                <input
                  type="radio"
                  name={`${groupId}-q-${qIndex + 1}`}
                  checked={answers[qIndex] === oIndex}
                  onChange={() =>
                    setAnswers(answers.map((answer, i) => (i === qIndex ? oIndex : answer)))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
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
        disabled={pending || !requestId}
        className="boton-primario self-start disabled:opacity-60"
      >
        {tList("T-2420")[1]}
      </button>
    </form>
  );
}
