"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { type ClientCopyCode, t, tList } from "@/shared/copy/client";
import { APP_TIME_ZONE, atHourIn } from "@/shared/lib/dates-pure";
import { ActionForm } from "@/shared/ui/ActionForm";
import {
  isPanalPangram,
  normalizePanalWord,
  PANAL_REWARD,
  panalCheckpoints,
  panalRank,
  panalWordError,
  panalWordScore,
  reachedPanalCheckpoints,
} from "../panal-engine";
import type { PanalDenial, PanalResult, SubmitPanalInput, TodayPanal } from "../panal-types";
import styles from "./Panal.module.css";

const ERROR_COPY: Record<PanalDenial, ClientCopyCode> = {
  INVALID_INPUT: "T-2756",
  NOT_FOUND: "T-2755",
  NOT_ELIGIBLE: "T-1250",
  NO_TERM: "T-1249",
  TERM_CLOSED: "T-1249",
  DICTIONARY_UNAVAILABLE: "T-2755",
  EXPIRED: "T-2753",
  TOO_SHORT: "T-2746",
  MISSING_CENTER: "T-2747",
  OUTSIDE_LETTERS: "T-2748",
  UNKNOWN_WORD: "T-2749",
};

type Props = {
  initial: TodayPanal;
  onStart: (day: string) => Promise<PanalResult>;
  onWord: (input: SubmitPanalInput) => Promise<PanalResult>;
};

export function Panal({ initial, onStart, onWord }: Props) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [game, setGame] = useState(initial.game);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState<SubmitPanalInput | null>(null);
  const [pending, startTransition] = useTransition();
  const [blocked, setBlocked] = useState(false);
  const [newDay, setNewDay] = useState(false);
  const puzzle = initial.puzzle;
  const [outer, setOuter] = useState(() =>
    [...(puzzle?.letters ?? "")].filter((letter) => letter !== puzzle?.center),
  );
  // Un refresh desde otra pestaña puede traer más palabras, jamás retroceder el progreso.
  const current =
    initial.game &&
    (!game || initial.game.words.length > game.words.length || initial.game.points > game.points)
      ? initial.game
      : game;
  const words = current?.words ?? [];
  const score = current?.score ?? 0;
  const canPlay = initial.availability === "AVAILABLE" && !blocked && !newDay;
  const active = canPlay && Boolean(current) && !current?.complete;
  const editable = active && !pending && !retry;
  const rank = puzzle ? (tList("T-2739")[panalRank(score, puzzle.maxScore)] ?? "") : "";

  const pendingReward = Boolean(
    current &&
      puzzle &&
      initial.checkpointsEnabled &&
      reachedPanalCheckpoints(words.length, score, puzzle.geniusScore).some(
        (checkpoint) => !current.awardedCheckpoints.includes(checkpoint.id),
      ),
  );
  useEffect(() => {
    const checkDay = () => {
      if (Date.now() >= Date.parse(initial.nextAvailableAt)) setNewDay(true);
    };
    const timer = setTimeout(
      checkDay,
      Math.max(0, Date.parse(initial.nextAvailableAt) - Date.now()),
    );
    const sync = () => {
      checkDay();
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

  function act(request?: SubmitPanalInput) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = request ? await onWord(request) : await onStart(initial.day);
        setRetry(null);
        if (result.game) setGame(result.game);
        if (result.ok) {
          setDraft("");
          if (request) {
            const award = result.game.points - (current?.points ?? 0);
            const wordMessage = result.added
              ? t(isPanalPangram(request.word) ? "T-2744" : "T-2743", {
                  palabra: request.word,
                  n: panalWordScore(request.word),
                })
              : t("T-2745");
            setMessage(
              award > 0
                ? `${wordMessage} ${t("T-3009", {
                    premio: t(award === 1 ? "T-3478" : "T-3479", { n: award }),
                  })}`
                : wordMessage,
            );
          } else if (current && result.game.points > current.points) {
            const award = result.game.points - current.points;
            setMessage(
              t("T-3009", {
                premio: t(award === 1 ? "T-3478" : "T-3479", { n: award }),
              }),
            );
          }
        } else {
          setMessage(t(ERROR_COPY[result.reason]));
          if (
            [
              "NO_TERM",
              "TERM_CLOSED",
              "NOT_ELIGIBLE",
              "EXPIRED",
              "DICTIONARY_UNAVAILABLE",
              "NOT_FOUND",
            ].includes(result.reason)
          )
            setBlocked(true);
        }
      } catch {
        if (request) setRetry(request);
        setMessage(t("T-2751"));
      } finally {
        busy.current = false;
      }
    });
  }

  function submit() {
    if (retry) return act(retry);
    if (!active || !current || !puzzle || busy.current) return;
    const word = normalizePanalWord(draft);
    const error = panalWordError(word, puzzle.letters, puzzle.center);
    if (error) return setMessage(t(ERROR_COPY[error]));
    if (words.includes(word)) return setMessage(t("T-2745"));
    act({ gameId: current.id, word });
  }

  function addLetter(letter: string) {
    setDraft((value) => (value + letter).slice(0, 32));
  }

  function shuffle() {
    const next = [...outer];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j] ?? "", next[i] ?? ""];
    }
    if (next.join("") === outer.join("")) next.push(next.shift() ?? "");
    setOuter(next);
  }

  return (
    <section id="panal" aria-label={t("T-2722")} className={styles.game}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde pb-4">
        <time dateTime={initial.day} className="text-sm text-tinta-suave">
          {new Intl.DateTimeFormat("es-CO", {
            timeZone: APP_TIME_ZONE,
            day: "numeric",
            month: "long",
          }).format(atHourIn(APP_TIME_ZONE, initial.day, 12))}
        </time>
        <span className="font-semibold">{t("T-2762", { rango: rank })}</span>
      </div>
      {puzzle ? (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <strong className="tabular-nums">{t("T-2732", { n: score })}</strong>
              <span>{t("T-2733", { n: words.length, total: puzzle.totalWords })}</span>
            </div>
            <progress
              className={styles.progress}
              value={score}
              max={puzzle.maxScore}
              aria-label={t("T-2732", { n: score })}
            />
            <p className="text-sm text-tinta-suave">
              {current?.complete
                ? t("T-2742")
                : current?.points === PANAL_REWARD
                  ? t("T-2741")
                  : t("T-2740", { n: Math.max(0, puzzle.geniusScore - score) })}
            </p>
          </div>
          <div className={styles.columns}>
            <div className="flex min-w-0 flex-col gap-4">
              <ActionForm
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
                className="flex flex-col gap-2 sm:gap-4"
              >
                <label htmlFor={inputId} className="sr-only">
                  {t("T-2726")}
                </label>
                <output
                  className="min-h-6 text-center text-sm font-semibold"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {pending ? t("T-2750") : message || t("T-2726")}
                </output>
                <input
                  ref={input}
                  id={inputId}
                  value={draft}
                  disabled={!editable}
                  onChange={(event) =>
                    setDraft(normalizePanalWord(event.target.value).slice(0, 32))
                  }
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={64}
                  className={styles.input}
                />
                <fieldset className={styles.hive} aria-label={t("T-2731")} disabled={!editable}>
                  {[puzzle.center, ...outer].map((letter, index) => (
                    <button
                      key={index === 0 ? "center" : `outer-${index}`}
                      type="button"
                      className={`${styles.cell} ${index === 0 ? styles.center : ""}`}
                      aria-label={index === 0 ? t("T-2730", { letra: letter }) : letter}
                      onClick={() => addLetter(letter)}
                    >
                      {letter}
                    </button>
                  ))}
                </fieldset>
                <p className="text-center text-sm font-semibold">
                  {t("T-2760", { letra: puzzle.center })}
                </p>
                {current ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      className="boton-secundario"
                      disabled={!editable}
                      onClick={() => setDraft((value) => value.slice(0, -1))}
                    >
                      {t("T-2728")}
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      disabled={!editable}
                      onClick={shuffle}
                    >
                      {t("T-2729")}
                    </button>
                    <button
                      type="submit"
                      className="boton-primario"
                      disabled={pending || (!active && !retry)}
                    >
                      {retry ? t("T-2757") : t("T-2727")}
                    </button>
                  </div>
                ) : canPlay ? (
                  <button
                    type="button"
                    className="boton-primario self-center"
                    disabled={pending}
                    onClick={() => act()}
                  >
                    {t("T-2725")}
                  </button>
                ) : null}
              </ActionForm>
              {initial.checkpointsEnabled ? (
                <Link
                  href="/app/juegos"
                  className="self-center text-sm font-semibold underline underline-offset-4"
                  aria-disabled={pending}
                  onClick={(event) => {
                    if (busy.current) event.preventDefault();
                  }}
                >
                  {t("T-3007")}
                </Link>
              ) : null}
              {initial.availability !== "AVAILABLE" ? (
                <p className="text-sm">{t(ERROR_COPY[initial.availability])}</p>
              ) : null}
              {newDay ? <p className="text-sm">{t("T-2753")}</p> : null}
              {newDay || blocked || message ? (
                <button
                  type="button"
                  className="self-center text-sm font-semibold underline underline-offset-4"
                  disabled={pending}
                  onClick={() => router.refresh()}
                >
                  {t("T-2754")}
                </button>
              ) : null}
            </div>
            <aside className="flex min-w-0 flex-col gap-6">
              <div>
                <h2 className="mb-3 text-titulo-md">{t("T-3000")}</h2>
                <p className="text-sm font-semibold tabular-nums">
                  {t("T-3001", { n: current?.points ?? 0 })}
                </p>
                <p className="mt-2 text-sm">
                  {current?.points === PANAL_REWARD
                    ? t("T-3485")
                    : initial.checkpointsEnabled
                      ? t(current?.points ? "T-3434" : "T-3433")
                      : t("T-2738", {
                          premio: t("T-3479", { n: PANAL_REWARD }),
                        })}
                </p>
                {initial.checkpointsEnabled ? (
                  <ul className="mt-3 list-none space-y-2 p-0 text-sm">
                    {panalCheckpoints(puzzle.geniusScore).map((checkpoint) => (
                      <li
                        key={checkpoint.id}
                        className="flex flex-wrap justify-between gap-x-4 gap-y-1"
                      >
                        <span>
                          {checkpoint.words ? t("T-3002", { n: checkpoint.words }) : t("T-3003")}
                          {current?.awardedCheckpoints.includes(checkpoint.id)
                            ? ` · ${t("T-3005")}`
                            : ""}
                        </span>
                        <span className="tabular-nums">
                          {t("T-3004", { n: checkpoint.points })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-sm text-tinta-suave">{t("T-3008")}</p>
                {pendingReward && canPlay ? (
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <p className="text-sm">{t("T-3013")}</p>
                    <button
                      type="button"
                      className="boton-secundario"
                      disabled={pending}
                      onClick={() => act()}
                    >
                      {t("T-3012")}
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <h2 className="mb-3 text-titulo-md">{t("T-2734")}</h2>
                {words.length ? (
                  <ul className={styles.words}>
                    {words
                      .toSorted((a, b) => a.localeCompare(b, "es"))
                      .map((word) => (
                        <li key={word} className={isPanalPangram(word) ? styles.pangram : ""}>
                          <span aria-hidden={isPanalPangram(word) ? true : undefined}>{word}</span>
                          {isPanalPangram(word) ? (
                            <span className="sr-only">{t("T-2758", { palabra: word })}</span>
                          ) : null}
                          <span aria-hidden="true">+{panalWordScore(word)}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-tinta-suave">{t("T-2735")}</p>
                )}
              </div>
              <details open className="border-t border-borde pt-4">
                <summary className="cursor-pointer font-semibold">{t("T-2736")}</summary>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-tinta-suave">
                  {tList("T-2737").map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-semibold">
                  {initial.checkpointsEnabled
                    ? t("T-3011")
                    : t("T-2738", {
                        premio: t("T-3479", { n: PANAL_REWARD }),
                      })}
                </p>
              </details>
            </aside>
          </div>
        </>
      ) : (
        <p>{t("T-2755")}</p>
      )}
    </section>
  );
}
