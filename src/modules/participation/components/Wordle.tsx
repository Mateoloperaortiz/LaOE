"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type CopyCode, t, tList } from "@/shared/copy";
import { ArrowsHorizontalIcon } from "@/shared/ui/icons/ArrowsHorizontalIcon";
import { CheckIcon } from "@/shared/ui/icons/CheckIcon";
import { XIcon } from "@/shared/ui/icons/XIcon";
import type {
  SubmitWordleInput,
  TodayWordle,
  WordleDenial,
  WordleLetterState,
  WordleResult,
} from "../wordle-types";

const KEYS = ["QWERTYUIOP", "ASDFGHJKLÑ", "ZXCVBNM"];
const ROWS = [0, 1, 2, 3, 4, 5];
const COLUMNS = [0, 1, 2, 3, 4];
const COLORS: Record<WordleLetterState, string> = {
  correct: "border-oe-blue bg-oe-blue text-oe-navy",
  present: "border-oe-yellow bg-oe-yellow text-oe-navy",
  absent: "border-oe-navy bg-oe-navy text-oe-paper",
};
// La marca acompaña al color para que el estado no dependa solo de él; va con trazo grueso porque
// mide 10 a 14 px. El estado que se anuncia es el texto `sr-only` de cada celda.
const MARKS: Record<WordleLetterState, typeof CheckIcon> = {
  correct: CheckIcon,
  present: ArrowsHorizontalIcon,
  absent: XIcon,
};
const WEIGHT = { absent: 1, present: 2, correct: 3 } as const;
const ERROR_COPY: Record<WordleDenial, CopyCode> = {
  INVALID_INPUT: "T-1243",
  NOT_FOUND: "T-1255",
  NOT_ELIGIBLE: "T-1250",
  NO_TERM: "T-1249",
  TERM_CLOSED: "T-1249",
  EXPIRED: "T-1252",
  FINISHED: "T-1267",
  STALE_ATTEMPT: "T-1253",
  UNKNOWN_WORD: "T-1244",
  DICTIONARY_UNAVAILABLE: "T-1251",
  EXHAUSTED: "T-1251",
  REQUEST_CONFLICT: "T-1255",
};

function keyboardWord(value: string): string {
  return value
    .normalize("NFC")
    .toUpperCase()
    .replace(
      /[ÁÉÍÓÚÜ]/g,
      (letter) => ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" })[letter] ?? letter,
    )
    .replace(/[^A-ZÑ]/g, "")
    .slice(0, 5);
}

function displayDay(instant: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
  }).format(new Date(instant));
}

type Props = {
  initial: TodayWordle;
  onStart: () => Promise<WordleResult>;
  onGuess: (input: SubmitWordleInput) => Promise<WordleResult>;
};

export function Wordle({ initial, onStart, onGuess }: Props) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [game, setGame] = useState(initial.game);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState<SubmitWordleInput | null>(null);
  const [pending, startTransition] = useTransition();
  const [newDay, setNewDay] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const attempts = game?.attempts ?? [];
  const canPlay = initial.availability === "AVAILABLE" && !newDay && !blocked;
  const active = canPlay && game?.status === "IN_PROGRESS";
  const editable = active && !pending && !retry;
  const [correct = "", present = "", absent = ""] = tList("T-1240");
  const labels = { correct, present, absent };
  const letterStates = new Map<string, WordleLetterState>();
  for (const attempt of attempts) {
    Array.from(attempt.guess).forEach((letter, index) => {
      const state = attempt.feedback[index];
      const before = letterStates.get(letter);
      if (state && (!before || WEIGHT[state] > WEIGHT[before])) letterStates.set(letter, state);
    });
  }

  useEffect(() => {
    if (editable) input.current?.focus({ preventScroll: true });
  }, [editable]);

  useEffect(() => {
    const delay = Math.max(0, new Date(initial.nextAvailableAt).getTime() - Date.now());
    const timer = setTimeout(() => setNewDay(true), Math.min(delay, 2_147_483_647));
    const sync = () => {
      if (!busy.current && document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [initial.nextAvailableAt, router]);

  function act(request?: SubmitWordleInput) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = request ? await onGuess(request) : await onStart();
        setRetry(null);
        if (result.game) setGame(result.game);
        if (result.ok) {
          setDraft("");
        } else {
          setMessage(t(ERROR_COPY[result.reason]));
          if (["NO_TERM", "TERM_CLOSED", "NOT_ELIGIBLE", "EXPIRED"].includes(result.reason)) {
            setBlocked(true);
          }
          if (result.reason === "STALE_ATTEMPT") setDraft("");
        }
      } catch {
        if (request) setRetry(request);
        setMessage(t("T-1254"));
      } finally {
        busy.current = false;
      }
    });
  }

  function submit() {
    if (retry) return act(retry);
    if (!active || !game || busy.current) return;
    if (!/^[A-ZÑ]{5}$/.test(draft)) return setMessage(t("T-1243"));
    act({
      gameId: game.id,
      guess: draft,
      requestId: crypto.randomUUID(),
      expectedAttempt: attempts.length + 1,
    });
  }

  return (
    <section
      id="wordle"
      aria-labelledby="wordle-title"
      className="rounded-[var(--radius-cartel)] border-2 border-borde bg-fondo-alterno p-4 sm:p-6"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 id="wordle-title" className="text-display-md">
            {t("T-1230")}
          </h2>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-1231")}</p>
        </div>
        <time
          dateTime={initial.day}
          className="eyebrow rounded-full bg-oe-yellow px-3 py-2 text-oe-navy"
        >
          {displayDay(`${initial.day}T12:00:00-05:00`)}
        </time>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.65fr)] lg:gap-10">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <ol
            aria-label={t("T-1262")}
            className="mx-auto grid w-full max-w-xs list-none gap-1.5 p-0"
          >
            {ROWS.map((row) => {
              const attempt = attempts[row];
              const letters = attempt?.guess ?? (row === attempts.length && active ? draft : "");
              return (
                <li
                  key={row}
                  aria-label={t("T-1241", { n: row + 1 })}
                  className="grid grid-cols-5 gap-1.5"
                >
                  {COLUMNS.map((column) => {
                    const letter = letters[column] ?? "";
                    const state = attempt?.feedback[column];
                    const Mark = state ? MARKS[state] : null;
                    return (
                      <span
                        key={column}
                        className={`relative flex aspect-square items-center justify-center rounded-lg border-2 text-2xl font-bold sm:text-3xl ${state ? COLORS[state] : "border-borde bg-fondo text-tinta"}`}
                      >
                        <span aria-hidden="true">{letter}</span>
                        {Mark ? (
                          <Mark size={12} stroke={3} className="absolute right-1 bottom-1" />
                        ) : null}
                        <span className="sr-only">
                          {letter
                            ? t("T-1242", {
                                letra: letter,
                                estado: state ? labels[state] : t("T-1236"),
                              })
                            : t("T-1263")}
                        </span>
                      </span>
                    );
                  })}
                </li>
              );
            })}
          </ol>

          <output className="min-h-6 text-sm font-semibold" aria-live="polite" aria-atomic="true">
            {pending
              ? t("T-1239")
              : message ||
                (game?.status === "WON"
                  ? t("T-1245", { n: attempts.length, puntos: game.points })
                  : game?.status === "LOST"
                    ? t("T-1246")
                    : game?.status === "EXPIRED"
                      ? initial.availability === "AVAILABLE"
                        ? t("T-1252")
                        : ""
                      : active
                        ? t("T-1264", { n: 6 - attempts.length })
                        : "")}
          </output>
          {game?.answer ? (
            <p className="text-lg font-bold">{t("T-1247", { palabra: game.answer })}</p>
          ) : null}

          {active ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="flex flex-col gap-3"
            >
              <label htmlFor={inputId} className="text-sm font-semibold">
                {t("T-1236")}
              </label>
              <input
                ref={input}
                id={inputId}
                value={draft}
                onChange={(event) => setDraft(keyboardWord(event.target.value))}
                disabled={!editable}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={10}
                className="min-h-12 w-full rounded-lg border-2 border-borde bg-fondo px-3 font-bold tracking-widest text-tinta"
              />
              <fieldset aria-label={t("T-1259")} className="flex flex-col gap-1">
                {KEYS.map((keys) => (
                  <div key={keys} className="flex justify-center gap-1">
                    {Array.from(keys).map((letter) => {
                      const state = letterStates.get(letter);
                      const Mark = state ? MARKS[state] : null;
                      return (
                        <button
                          key={letter}
                          type="button"
                          disabled={!editable}
                          aria-label={
                            state ? t("T-1242", { letra: letter, estado: labels[state] }) : letter
                          }
                          onClick={() => setDraft((value) => keyboardWord(value + letter))}
                          className={`relative flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-md border text-sm font-bold disabled:opacity-60 ${state ? COLORS[state] : "border-borde bg-fondo text-tinta"}`}
                        >
                          <span>{letter}</span>
                          {Mark ? (
                            <Mark size={10} stroke={3} className="absolute right-0.5 bottom-0.5" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="boton-primario flex-1 disabled:opacity-60"
                >
                  {retry ? t("T-1268") : t("T-1237")}
                </button>
                <button
                  type="button"
                  disabled={!editable}
                  className="boton-secundario disabled:opacity-60"
                  onClick={() => setDraft((value) => value.slice(0, -1))}
                >
                  {t("T-1238")}
                </button>
              </div>
            </form>
          ) : !game && canPlay ? (
            <button
              type="button"
              className="boton-primario self-center disabled:opacity-60"
              disabled={pending}
              onClick={() => act()}
            >
              {t("T-1232")}
            </button>
          ) : null}
          {initial.availability !== "AVAILABLE" ? (
            <p className="text-sm">
              {t(initial.availability === "NOT_ELIGIBLE" ? "T-1250" : "T-1249")}
            </p>
          ) : null}
          {newDay ? <p className="text-sm font-semibold">{t("T-1266")}</p> : null}
          {!active && retry ? (
            <button
              type="button"
              className="boton-primario"
              disabled={pending}
              onClick={() => act(retry)}
            >
              {t("T-1268")}
            </button>
          ) : null}
          {game || newDay || message ? (
            <button
              type="button"
              className="self-start text-sm font-semibold underline underline-offset-4"
              disabled={pending}
              onClick={() => router.refresh()}
            >
              {t("T-1256")}
            </button>
          ) : null}
        </div>

        <aside
          aria-label={t("T-1260")}
          className="flex flex-col gap-5 border-borde lg:border-l lg:pl-8"
        >
          <div className="flex flex-wrap gap-3 text-xs font-semibold">
            {(["correct", "present", "absent"] as const).map((state) => {
              const Mark = MARKS[state];
              return (
                <span key={state} className="flex items-center gap-1.5">
                  <span
                    className={`flex size-6 items-center justify-center rounded border ${COLORS[state]}`}
                  >
                    <Mark size={14} stroke={2.5} />
                  </span>
                  {labels[state]}
                </span>
              );
            })}
          </div>
          <details>
            <summary className="cursor-pointer font-semibold">{t("T-1260")}</summary>
            <p className="mt-2 text-sm leading-relaxed text-tinta-suave">{t("T-1233")}</p>
          </details>
          <div>
            <h3 className="mb-3 text-titulo-sm">{t("T-1234")}</h3>
            <table className="w-full max-w-xs text-center text-sm">
              <tbody>
                <tr>
                  <th scope="row" className="py-2 text-left font-semibold">
                    {tList("T-1235")[0]}
                  </th>
                  {ROWS.map((index) => (
                    <td key={index} className="px-1 py-2">
                      {index + 1}
                    </td>
                  ))}
                </tr>
                <tr className="border-t border-borde">
                  <th scope="row" className="py-2 text-left font-semibold">
                    {tList("T-1235")[1]}
                  </th>
                  {ROWS.map((index) => (
                    <td key={index} className="px-1 py-2 font-bold">
                      +{6 - index}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-tinta-suave">{t("T-1265")}</p>
          </div>
          {initial.availability === "AVAILABLE" && !blocked ? (
            <p className="text-sm text-tinta-suave">
              {t("T-1248", { fecha: displayDay(initial.nextAvailableAt) })}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
