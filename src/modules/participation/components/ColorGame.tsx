"use client";

import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useRef, useState, useTransition } from "react";
import { type ClientCopyCode, t, tList } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { ArrowRightIcon } from "@/shared/ui/icons/ArrowRightIcon";
import { COLOR_POINT_THRESHOLDS, COLOR_ROUNDS, COLOR_WATCH_MS } from "../color-engine";
import type {
  ColorDenial,
  ColorResult,
  ColorRoundResult,
  HslColor,
  NextColorRoundInput,
  StartColorInput,
  SubmitColorRoundInput,
  TodayColor,
} from "../color-types";
import styles from "./ColorGame.module.css";
import { GamePreview } from "./GamePreview";

const ERROR_COPY: Record<ColorDenial, ClientCopyCode> = {
  INVALID_INPUT: "T-3543",
  NOT_FOUND: "T-3543",
  NOT_ELIGIBLE: "T-3541",
  NO_TERM: "T-3542",
  TERM_CLOSED: "T-3542",
  EXPIRED: "T-3525",
  FINISHED: "T-3545",
  REQUEST_CONFLICT: "T-3545",
  ROUND_NOT_READY: "T-3545",
  TOO_EARLY: "T-3544",
};

type Request =
  | { kind: "START"; input: StartColorInput }
  | { kind: "NEXT"; input: NextColorRoundInput }
  | { kind: "SUBMIT"; input: SubmitColorRoundInput };

type Props = {
  initial: TodayColor;
  onStart: (input: StartColorInput) => Promise<ColorResult>;
  onNextRound: (input: NextColorRoundInput) => Promise<ColorResult>;
  onSubmit: (input: SubmitColorRoundInput) => Promise<ColorResult>;
};

type SliderStyle = CSSProperties & { "--slider-track": string };

const INITIAL_MIX: HslColor = { h: 180, s: 50, l: 50 };
const precision = (value: number) =>
  value.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const colorCss = ({ h, s, l }: HslColor) => `hsl(${h} ${s}% ${l}%)`;

function Comparison({ result }: { result: ColorRoundResult }) {
  return (
    <div className={styles.comparison}>
      {[
        { name: t("T-3509"), color: result.target },
        { name: t("T-3503"), color: result.answer },
      ].map(({ name, color }) => (
        <figure key={name}>
          <div
            className={styles.swatch}
            role="img"
            aria-label={name}
            style={{ background: colorCss(color) }}
          />
          <figcaption>{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** La casa decide secuencia, precisión y premio. La UI sólo observa y envía mezclas HSL. */
export function ColorGame({ initial, onStart, onNextRound, onSubmit }: Props) {
  const router = useRouter();
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef<string | null>(null);
  const requestedRefresh = useRef(false);
  const [run, setRun] = useState(initial.open ?? initial.credited);
  const [answer, setAnswer] = useState<HslColor>(INITIAL_MIX);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState<Request | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [creditedToday, setCreditedToday] = useState(Boolean(initial.credited));
  const [watched, setWatched] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(Math.ceil(COLOR_WATCH_MS / 1000));
  const [pendingKind, setPendingKind] = useState<Request["kind"] | null>(null);
  const [pending, startTransition] = useTransition();
  const watchKey = run?.target ? `${run.id}:${run.round}` : null;
  const roundKey = run ? `${run.id}:${run.round}` : null;
  const last = run?.results.at(-1);
  const finished = run?.status === "FINISHED";
  const phase = finished
    ? "FINISHED"
    : !run || run.status === "EXPIRED"
      ? "READY"
      : last?.round === run.round
        ? "RESULT"
        : watchKey && watched !== watchKey
          ? "WATCH"
          : "MATCH";
  const available = initial.availability === "AVAILABLE" && !blocked;
  const [hueLabel, saturationLabel, lightnessLabel] = tList("T-3506");
  const [averageHeading, pointsHeading] = tList("T-3533");

  // Un refresh explícito adopta el estado guardado, también después de jugar en otra pestaña.
  useEffect(() => {
    if (!requestedRefresh.current) return;
    requestedRefresh.current = false;
    setRun(initial.open ?? initial.credited);
    setCreditedToday(Boolean(initial.credited));
    setBlocked(false);
    setRetry(null);
    setMessage("");
  }, [initial]);

  useEffect(() => {
    if (roundKey) setAnswer(INITIAL_MIX);
  }, [roundKey]);

  // Tres segundos visibles desde el primer paint; la latencia no se los quita a la persona.
  // Ocultar la pestaña pausa el tiempo restante, sin reiniciar la observación ni revelar otro color.
  useEffect(() => {
    if (!watchKey) return;
    setRemaining(Math.ceil(COLOR_WATCH_MS / 1000));
    let elapsed = 0;
    let previous: number | null = null;
    let frame = 0;
    let visible = document.visibilityState === "visible";
    const visibility = () => {
      visible = document.visibilityState === "visible";
      previous = null;
    };
    const tick = (now: number) => {
      if (visible && previous !== null) elapsed += now - previous;
      previous = visible ? now : null;
      const left = Math.max(0, COLOR_WATCH_MS - elapsed);
      setRemaining(Math.ceil(left / 1000));
      if (left === 0) setWatched(watchKey);
      else frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [watchKey]);

  useEffect(() => {
    if (previousPhase.current && previousPhase.current !== phase) heading.current?.focus();
    previousPhase.current = phase;
  }, [phase]);

  function act(request: Request) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    setPendingKind(request.kind);
    startTransition(async () => {
      try {
        const result =
          request.kind === "START"
            ? await onStart(request.input)
            : request.kind === "NEXT"
              ? await onNextRound(request.input)
              : await onSubmit(request.input);
        setRetry(null);
        if (result.ok) {
          setRun(result.run);
          if (result.run.points > 0) setCreditedToday(true);
          if (
            result.run.watchUntil &&
            !result.run.target &&
            result.run.results.length < result.run.round
          )
            setMessage(t("T-3547"));
        } else {
          setMessage(t(ERROR_COPY[result.reason]));
          if (result.reason !== "TOO_EARLY") setBlocked(true);
        }
      } catch {
        setRetry(request);
        setMessage(t("T-3519"));
      } finally {
        busy.current = false;
        setPendingKind(null);
      }
    });
  }

  const status =
    message ||
    (phase === "WATCH"
      ? t("T-3502")
      : phase === "MATCH"
        ? t("T-3530")
        : phase === "RESULT"
          ? t("T-3531")
          : "");
  const startButton = (again = false) => (
    <button
      type="button"
      className={styles.primary}
      disabled={pending || Boolean(retry)}
      onClick={() => act({ kind: "START", input: { requestId: crypto.randomUUID() } })}
    >
      {pendingKind === "START" ? t("T-3521") : t(again ? "T-3517" : "T-3498")}
      <ArrowRightIcon />
    </button>
  );

  return (
    <section id="color" aria-label={t("T-3487")} className={styles.game}>
      <div className={styles.bar}>
        <p>{t("T-3495")}</p>
        {run ? (
          <p className={styles.rounds}>
            <span className="sr-only">{t("T-3528", { n: run.round, total: COLOR_ROUNDS })}</span>
            {Array.from({ length: COLOR_ROUNDS }, (_, index) => index + 1).map((round) => (
              <span
                key={round}
                className={styles.roundDot}
                data-current={round === run.round}
                aria-hidden="true"
              >
                {round}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <p className={styles.notice}>{t(creditedToday ? "T-3524" : "T-3522")}</p>

      {phase === "READY" ? (
        <div className={styles.ready}>
          <div>
            <h2 ref={heading} tabIndex={-1} className={styles.title}>
              {t("T-3496")}
            </h2>
            <p className={styles.description}>{t("T-3497")}</p>
            {available ? <div className={styles.actions}>{startButton()}</div> : null}
          </div>
          <div className={styles.readyArt}>
            <GamePreview game="COLOR" featured />
          </div>
        </div>
      ) : null}

      {phase === "WATCH" && run?.target ? (
        <div className={`${styles.panel} ${styles.watch}`}>
          <div
            role="img"
            aria-label={t("T-3499")}
            className={styles.swatch}
            style={{ background: colorCss(run.target) }}
          />
          <div>
            <h2 ref={heading} tabIndex={-1} className={styles.title}>
              {t("T-3500")}
            </h2>
            <p className={styles.description}>{t("T-3501")}</p>
            <span className={styles.seconds} aria-hidden="true">
              {t("T-3527", { n: remaining })}
            </span>
          </div>
        </div>
      ) : null}

      {phase === "MATCH" && run ? (
        <ActionForm
          className={`${styles.panel} ${styles.mix}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (available && !retry)
              act({
                kind: "SUBMIT",
                input: {
                  runId: run.id,
                  round: run.round,
                  answer: { ...answer },
                  requestId: crypto.randomUUID(),
                },
              });
          }}
        >
          <div className={styles.mixPreview}>
            <div
              role="img"
              aria-label={t("T-3503")}
              className={styles.swatch}
              style={{ background: colorCss(answer) }}
            />
            <p>{t("T-3504")}</p>
          </div>
          <div>
            <h2 ref={heading} tabIndex={-1} className={styles.title}>
              {t("T-3505")}
            </h2>
            <p className={styles.description}>{t("T-3507")}</p>
            <fieldset
              className={styles.controls}
              disabled={pending || Boolean(retry) || !available}
            >
              <legend className="sr-only">{t("T-3507")}</legend>
              {[
                {
                  key: "h" as const,
                  label: hueLabel,
                  max: 360,
                  unit: "°",
                  track:
                    "linear-gradient(to right, hsl(0 80% 50%), hsl(60 80% 50%), hsl(120 80% 50%), hsl(180 80% 50%), hsl(240 80% 50%), hsl(300 80% 50%), hsl(360 80% 50%))",
                },
                {
                  key: "s" as const,
                  label: saturationLabel,
                  max: 100,
                  unit: "%",
                  track: `linear-gradient(to right, hsl(${answer.h} 0% 50%), hsl(${answer.h} 100% 50%))`,
                },
                {
                  key: "l" as const,
                  label: lightnessLabel,
                  max: 100,
                  unit: "%",
                  track: `linear-gradient(to right, hsl(${answer.h} ${answer.s}% 0%), hsl(${answer.h} ${answer.s}% 50%), hsl(${answer.h} ${answer.s}% 100%))`,
                },
              ].map(({ key, label, max, unit, track }) => {
                const sliderStyle: SliderStyle = { "--slider-track": track };
                return (
                  <div key={key}>
                    <div className={styles.controlLabel}>
                      <label htmlFor={`color-${key}`}>{label}</label>
                      <output htmlFor={`color-${key}`} aria-hidden="true">
                        {answer[key]}
                        {unit}
                      </output>
                    </div>
                    <input
                      id={`color-${key}`}
                      name={key}
                      type="range"
                      min={0}
                      max={max}
                      step={1}
                      value={answer[key]}
                      onChange={(event) =>
                        setAnswer({ ...answer, [key]: Number(event.target.value) })
                      }
                      className={styles.slider}
                      style={sliderStyle}
                    />
                  </div>
                );
              })}
            </fieldset>
            <div className={styles.actions}>
              <button
                type="submit"
                disabled={pending || Boolean(retry) || !available}
                className={styles.primary}
              >
                {pendingKind === "SUBMIT" ? t("T-3520") : t("T-3508")}
                <ArrowRightIcon />
              </button>
            </div>
          </div>
        </ActionForm>
      ) : null}

      {phase === "RESULT" && run && last ? (
        <div className={styles.panel}>
          <div className={styles.result}>
            <div>
              <h2 ref={heading} tabIndex={-1} className={styles.title}>
                {t("T-3510")}
              </h2>
              <p className={styles.description}>
                {t("T-3528", { n: run.round, total: COLOR_ROUNDS })}
              </p>
            </div>
            <div>
              <span className={styles.score}>{precision(last.accuracy)}%</span>
              <p className={styles.scoreCaption}>{t("T-3512")}</p>
            </div>
          </div>
          <Comparison result={last} />
          <div className={styles.actions}>
            <button
              type="button"
              disabled={pending || Boolean(retry) || !available}
              className={styles.primary}
              onClick={() =>
                act({ kind: "NEXT", input: { runId: run.id, requestId: crypto.randomUUID() } })
              }
            >
              {pendingKind === "NEXT" ? t("T-3532") : t("T-3513")}
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      ) : null}

      {finished && run?.average !== null && run?.average !== undefined ? (
        <div>
          <div className={styles.final}>
            <h2 ref={heading} tabIndex={-1} className={styles.title}>
              {t("T-3514")}
            </h2>
            <output
              className={styles.score}
              aria-live="off"
              aria-label={t("T-3526", { n: precision(run.average) })}
            >
              {precision(run.average)}%
            </output>
            <p className={styles.scoreCaption}>{t("T-3515")}</p>
            <p className={styles.description}>{t("T-3516")}</p>
            <p className={styles.award}>
              {run.points > 0
                ? t("T-3523", {
                    premio: t(run.points === 1 ? "T-3478" : "T-3479", { n: run.points }),
                  })
                : t("T-3548")}
            </p>
            {available ? <div className={styles.actions}>{startButton(true)}</div> : null}
          </div>
          <ol className={styles.history}>
            {run.results.map((result) => (
              <li key={result.round}>
                <p>{t("T-3536", { ronda: result.round, n: precision(result.accuracy) })}</p>
                <Comparison result={result} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <output aria-live="polite" className={styles.message}>
        {status}
      </output>
      {retry ? (
        <button
          type="button"
          className="boton-secundario self-start"
          disabled={pending}
          onClick={() => act(retry)}
        >
          {t("T-2663")}
        </button>
      ) : null}
      {blocked ? (
        <button
          type="button"
          className="boton-secundario self-start"
          disabled={pending}
          onClick={() => {
            requestedRefresh.current = true;
            router.refresh();
          }}
        >
          {t("T-3537")}
        </button>
      ) : null}
      {initial.availability !== "AVAILABLE" ? (
        <p className={styles.notice}>
          {t(initial.availability === "NOT_ELIGIBLE" ? "T-3541" : "T-3542")}
        </p>
      ) : null}

      <details className={styles.rules}>
        <summary>{t("T-3534")}</summary>
        <ul>
          {tList("T-3535").map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <table>
          <caption className="sr-only">{t("T-3534")}</caption>
          <thead>
            <tr>
              <th scope="col">{averageHeading}</th>
              <th scope="col" className="text-right">
                {pointsHeading}
              </th>
            </tr>
          </thead>
          <tbody>
            {COLOR_POINT_THRESHOLDS.map(({ minAverage, points }) => (
              <tr key={minAverage}>
                <th scope="row">{t("T-3539", { minimo: minAverage })}</th>
                <td>{points}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`${styles.notice} mt-4`}>{t("T-3538")}</p>
      </details>
    </section>
  );
}
