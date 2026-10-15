"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { type ClientCopyCode, t, tLabels, tList } from "@/shared/copy/client";
import { ArrowDownIcon } from "@/shared/ui/icons/ArrowDownIcon";
import { ArrowLeftIcon } from "@/shared/ui/icons/ArrowLeftIcon";
import { ArrowRightIcon } from "@/shared/ui/icons/ArrowRightIcon";
import { ArrowUpIcon } from "@/shared/ui/icons/ArrowUpIcon";
import {
  applyGame2048Move,
  GAME2048_MAX_MOVES,
  GAME2048_REWARDS,
  game2048Reward,
  newGame2048,
  replayGame2048,
} from "../game2048-engine";
import type {
  FinishGame2048Input,
  Game2048Denial,
  Game2048Move,
  Game2048Result,
  Game2048RunView,
  Game2048StartedView,
  Game2048StartResult,
  Game2048State,
  TodayGame2048,
} from "../game2048-types";
import { game2048Finished, game2048ReleasedBy } from "./game2048-resume";

// Tablero del 2048 (ADR-075). El juego corre entero en el navegador con el motor puro; al terminar
// manda solo la lista de movimientos y el servidor la rejuega. Cada ficha lleva su número, así que
// nunca hay información solo en color, y se opera con flechas, con botones o deslizando.

const DIRECTIONS = ["U", "D", "L", "R"] as const satisfies readonly Game2048Move[];
const DIRECTION_LABELS = tLabels("T-2639", DIRECTIONS);
const KEYS: Record<string, Game2048Move> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  w: "U",
  s: "D",
  a: "L",
  d: "R",
  W: "U",
  S: "D",
  A: "L",
  D: "R",
};
const ARROWS: Record<Game2048Move, typeof ArrowUpIcon> = {
  U: ArrowUpIcon,
  D: ArrowDownIcon,
  L: ArrowLeftIcon,
  R: ArrowRightIcon,
};
const SWIPE = 30;
const STORAGE = "oe-2048";
const EMPTY: number[] = new Array(16).fill(0);

// Contraste comprobado en claro y oscuro; el número de la ficha es el que informa, no el color.
const TILES: [limit: number, className: string][] = [
  [2, "border-oe-blue-soft bg-oe-paper text-oe-navy"],
  [4, "border-oe-blue-soft bg-oe-cream text-oe-navy"],
  [8, "border-oe-blue bg-oe-blue-soft text-oe-navy"],
  [16, "border-oe-blue bg-oe-blue text-oe-navy"],
  [32, "border-oe-sky bg-oe-sky text-oe-navy"],
  [64, "border-oe-yellow-soft bg-oe-yellow-soft text-oe-navy"],
  [128, "border-oe-yellow bg-oe-yellow text-oe-navy"],
  [256, "border-oe-orange-soft bg-oe-orange-soft text-oe-navy"],
  [512, "border-oe-orange bg-oe-orange text-oe-navy"],
  [1024, "border-oe-navy bg-oe-navy text-oe-paper"],
];
const TOP_TILE = "border-oe-yellow bg-oe-navy text-oe-yellow";

const ERROR_COPY: Record<Game2048Denial, ClientCopyCode> = {
  INVALID_INPUT: "T-2660",
  INVALID_MOVES: "T-2661",
  NOT_FOUND: "T-2660",
  NOT_ELIGIBLE: "T-2659",
  NO_TERM: "T-2658",
  TERM_CLOSED: "T-2658",
  EXPIRED: "T-2655",
  FINISHED: "T-2656",
  REQUEST_CONFLICT: "T-2660",
};

function tileClass(value: number): string {
  if (value === 0) return "border-borde bg-fondo";
  return TILES.find(([limit]) => limit === value)?.[1] ?? TOP_TILE;
}

function readStored(runId: string): string {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    const saved = raw ? (JSON.parse(raw) as { runId?: string; moves?: string }) : null;
    return saved?.runId === runId && typeof saved.moves === "string" ? saved.moves : "";
  } catch {
    return "";
  }
}

function writeStored(runId: string, moves: string): void {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify({ runId, moves }));
  } catch {
    // Una pestaña privada o el almacenamiento bloqueado no impiden jugar: solo no se retoma.
  }
}

function clearStored(): void {
  try {
    window.localStorage.removeItem(STORAGE);
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
}

type Live = { run: Game2048StartedView; state: Game2048State; moves: string };

type Props = {
  initial: TodayGame2048;
  onStart: (input: { requestId: string }) => Promise<Game2048StartResult>;
  onFinish: (input: FinishGame2048Input) => Promise<Game2048Result>;
};

export function Game2048({ initial, onStart, onFinish }: Props) {
  const router = useRouter();
  const busy = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const adopted = useRef<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [resuming, setResuming] = useState(false);
  const [done, setDone] = useState<Game2048RunView | null>(null);
  const [message, setMessage] = useState("");
  const [announce, setAnnounce] = useState("");
  const [retry, setRetry] = useState<FinishGame2048Input | null>(null);
  const [creditedToday, setCreditedToday] = useState(initial.credited !== null);
  const [pending, startTransition] = useTransition();
  const available = initial.availability === "AVAILABLE";
  const [scoreHeading, pointsHeading] = tList("T-2650");

  // Retoma la partida abierta: el motor es determinista, así que basta la semilla y los movimientos.
  // `adopted` evita que un refresco del servidor reabra el aviso sobre la partida que se está jugando.
  useEffect(() => {
    const open = initial.open;
    if (!open || adopted.current === open.id) return;
    adopted.current = open.id;
    const moves = readStored(open.id);
    const state = replayGame2048(open.seed, moves) ?? newGame2048(open.seed);
    setLive({ run: open, state, moves: state.moves === moves.length ? moves : "" });
    setResuming(true);
  }, [initial.open]);

  // Una negativa de la casa suelta la partida del tablero y deja «Empezar una partida». Cuál la
  // suelta lo decide `game2048ReleasedBy`: hoy, todas (ADR-123 regla 10).
  function fail(reason: Game2048Denial) {
    setMessage(t(ERROR_COPY[reason]));
    if (game2048ReleasedBy(reason)) {
      setLive(null);
      clearStored();
      router.refresh();
    }
  }

  function send(request: FinishGame2048Input) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await onFinish(request);
        setRetry(null);
        if (result.ok) {
          clearStored();
          setLive(null);
          setDone(result.run);
          if (result.run.points > 0) setCreditedToday(true);
          router.refresh();
        } else {
          fail(result.reason);
        }
      } catch {
        // Conserva la solicitud exacta: repetir el mismo requestId no acredita dos veces.
        setRetry(request);
        setMessage(t("T-2662"));
      } finally {
        busy.current = false;
      }
    });
  }

  function begin() {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    setDone(null);
    startTransition(async () => {
      try {
        const result = await onStart({ requestId: crypto.randomUUID() });
        if (!result.ok) {
          fail(result.reason);
          return;
        }
        adopted.current = result.run.id;
        const moves = readStored(result.run.id);
        const state = replayGame2048(result.run.seed, moves) ?? newGame2048(result.run.seed);
        setLive({ run: result.run, state, moves: state.moves === moves.length ? moves : "" });
        setResuming(false);
      } catch {
        setMessage(t("T-2662"));
      } finally {
        busy.current = false;
      }
    });
  }

  function move(direction: Game2048Move) {
    if (!live || resuming || pending || retry || done) return;
    const next = applyGame2048Move(live.state, direction);
    if (!next) return;
    const moves = live.moves + direction;
    writeStored(live.run.id, moves);
    setLive({ ...live, state: next, moves });
    const ganado = game2048Reward(next.score);
    if (next.over) {
      setAnnounce(t("T-2644", { puntaje: next.score }));
    } else if (moves.length >= GAME2048_MAX_MOVES) {
      setAnnounce(t("T-2645"));
    } else if (next.maxTile > live.state.maxTile) {
      setAnnounce(t("T-2642", { n: next.maxTile }));
    } else if (ganado > game2048Reward(live.state.score)) {
      setAnnounce(t("T-2643"));
    }
    if (next.over || moves.length >= GAME2048_MAX_MOVES) {
      send({ runId: live.run.id, moves, requestId: crypto.randomUUID() });
    }
  }

  // «Seguir» sobre un tablero retomado que ya terminó (su cierre no llegó a la casa y la persona
  // recargó): ninguna jugada lo cierra, así que se cierra acá, como lo habría cerrado su última
  // jugada (ADR-122 regla 15). Qué responde la casa al cerrar no cambia.
  function keepGoing() {
    if (!live) return;
    setResuming(false);
    if (game2048Finished(live.state)) {
      setAnnounce(live.state.over ? t("T-2644", { puntaje: live.state.score }) : t("T-2645"));
      send({ runId: live.run.id, moves: live.moves, requestId: crypto.randomUUID() });
    }
  }

  const playing = live !== null && !resuming && !done;

  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      const direction = KEYS[event.key];
      if (!direction || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section
      id="game2048"
      aria-labelledby="game2048-title"
      className="flex flex-col gap-5 rounded-[var(--radius-cartel)] border-2 border-borde bg-fondo-alterno p-4 sm:p-6"
    >
      <header className="flex flex-col gap-2">
        <h2 id="game2048-title" className="text-display-md">
          {t("T-2630")}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2631")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-semibold">
        <p>{t("T-2640", { puntaje: live?.state.score ?? done?.score ?? 0 })}</p>
        <p className="text-tinta-suave">
          {t("T-2641", { n: live?.state.maxTile ?? done?.maxTile ?? 0 })}
        </p>
        {initial.best > 0 ? (
          <p className="text-tinta-suave">{t("T-2664", { puntaje: initial.best })}</p>
        ) : null}
      </div>

      <ol
        aria-label={t("T-2635")}
        onPointerDown={(event) => {
          touch.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = touch.current;
          touch.current = null;
          if (!from) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
        }}
        style={{ touchAction: "none" }}
        className="mx-auto grid w-full max-w-sm list-none grid-cols-4 gap-2 rounded-2xl border-2 border-borde bg-fondo p-2"
      >
        {(live?.state.board ?? EMPTY).map((value, cell) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: las dieciséis casillas son fijas.
            key={cell}
            className={`flex aspect-square items-center justify-center rounded-xl border-2 font-semibold motion-safe:transition-colors ${
              value >= 1024 ? "text-base sm:text-lg" : "text-lg sm:text-2xl"
            } ${tileClass(value)}`}
          >
            <span aria-hidden="true">{value === 0 ? "" : value}</span>
            <span className="sr-only">{value === 0 ? t("T-2636") : t("T-2637", { n: value })}</span>
          </li>
        ))}
      </ol>

      {playing ? (
        <fieldset className="mx-auto grid w-full max-w-sm grid-cols-4 gap-2 border-0 p-0">
          <legend className="sr-only">{t("T-2638")}</legend>
          {DIRECTIONS.map((direction) => {
            const Arrow = ARROWS[direction];
            return (
              <button
                key={direction}
                type="button"
                onClick={() => move(direction)}
                className="boton-secundario justify-center text-lg"
              >
                <Arrow />
                <span className="sr-only">{DIRECTION_LABELS[direction] ?? direction}</span>
              </button>
            );
          })}
        </fieldset>
      ) : null}

      <output aria-live="polite" className="block min-h-6 text-sm font-semibold">
        {message || announce}
      </output>

      {done ? (
        <p className="text-sm font-semibold">
          {done.points > 0
            ? t("T-2651", {
                premio: t(done.points === 1 ? "T-3478" : "T-3479", { n: done.points }),
              })
            : creditedToday
              ? t("T-2653")
              : t("T-2652")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {retry ? (
          <button type="button" onClick={() => send(retry)} className="boton-primario">
            {t("T-2663")}
          </button>
        ) : null}
        {resuming && live ? (
          <>
            <p className="w-full text-sm">{t("T-2646")}</p>
            <button type="button" onClick={keepGoing} className="boton-primario">
              {t("T-2647")}
            </button>
            <button
              type="button"
              onClick={() =>
                send({
                  runId: live.run.id,
                  moves: live.moves,
                  requestId: crypto.randomUUID(),
                })
              }
              className="boton-secundario"
            >
              {t("T-2648")}
            </button>
          </>
        ) : null}
        {!live && available && !retry ? (
          <button type="button" onClick={begin} disabled={pending} className="boton-primario">
            {pending ? t("T-2634") : t("T-2633")}
          </button>
        ) : null}
      </div>

      {!available ? (
        <p className="text-sm">
          {initial.availability === "NOT_ELIGIBLE" ? t("T-2659") : t("T-2658")}
        </p>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t("T-2649")}</summary>
        <p className="mt-2 max-w-prose text-tinta-suave">{t("T-2632")}</p>
        <p className="mt-3 max-w-prose font-semibold">{t("T-3431")}</p>
        <table className="mt-3 w-full max-w-prose">
          <caption className="sr-only">{t("T-2649")}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-2 pr-3 text-left">
                {scoreHeading}
              </th>
              <th scope="col" className="py-2 text-right">
                {pointsHeading}
              </th>
            </tr>
          </thead>
          <tbody>
            {GAME2048_REWARDS.toReversed().map(([score, points]) => (
              <tr key={score} className="border-t border-borde">
                <th scope="row" className="py-2 pr-3 text-left font-normal tabular-nums">
                  {score.toLocaleString("es-CO")}
                </th>
                <td className="py-2 text-right tabular-nums">{points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
