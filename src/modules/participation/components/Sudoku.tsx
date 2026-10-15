"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";
import { type ClientCopyCode, t, tLabels, tList } from "@/shared/copy/client";
import { looksSolved, SUDOKU_DIFFICULTIES, sudokuConflicts } from "../sudoku-engine";
import {
  applySudokuAction,
  isSudokuCellLocked,
  newSudokuPlay,
  restoreSudokuPlay,
  type SudokuAction,
  sudokuEmptyCells,
  sudokuMistakes,
} from "../sudoku-play";
import type {
  AbandonSudokuInput,
  FinishSudokuInput,
  StartSudokuInput,
  SudokuDenial,
  SudokuDifficulty,
  SudokuPlay,
  SudokuResult,
  SudokuRunView,
  SudokuStartedView,
  SudokuStartResult,
  TodaySudoku,
} from "../sudoku-types";
import { SudokuBoard } from "./SudokuBoard";

// Sudoku de la biblioteca de juegos (ADR-078). El navegador solo conoce las dadas —y la solución si
// la partida es con ayudas—: sabe cuándo enviar porque una cuadrícula completa, sin repetidos y con
// las dadas en su lugar es la solución. El premio lo decide el servidor al comparar.

const STORAGE = "oe-sudoku";
const NONE: ReadonlySet<number> = new Set();

const ERROR_COPY: Record<SudokuDenial, ClientCopyCode> = {
  INVALID_INPUT: "T-2717",
  NOT_FOUND: "T-2717",
  NOT_ELIGIBLE: "T-2716",
  NO_TERM: "T-2715",
  TERM_CLOSED: "T-2715",
  EXPIRED: "T-2713",
  FINISHED: "T-2714",
  OPEN_RUN: "T-2719",
  NOT_SOLVED: "T-2718",
  REQUEST_CONFLICT: "T-2717",
};

function readStored(runId: string, givens: string): SudokuPlay | null {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    const saved = raw ? (JSON.parse(raw) as { runId?: string; play?: unknown }) : null;
    return saved?.runId === runId ? restoreSudokuPlay(saved.play, givens) : null;
  } catch {
    return null;
  }
}

function writeStored(runId: string, play: SudokuPlay): void {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify({ runId, play }));
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

function firstEmpty(values: string): number {
  const cell = values.indexOf("0");
  return cell === -1 ? 0 : cell;
}

/** La pila de deshacer vive en memoria: no se guarda en el navegador. */
type Live = { run: SudokuStartedView; play: SudokuPlay; history: SudokuPlay[] };

type Props = {
  initial: TodaySudoku;
  onStart: (input: StartSudokuInput) => Promise<SudokuStartResult>;
  onFinish: (input: FinishSudokuInput) => Promise<SudokuResult>;
  onAbandon: (input: AbandonSudokuInput) => Promise<SudokuResult>;
};

export function Sudoku({ initial, onStart, onFinish, onAbandon }: Props) {
  const router = useRouter();
  const busy = useRef(false);
  const adopted = useRef<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [resuming, setResuming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<SudokuRunView | null>(null);
  const [difficulty, setDifficulty] = useState<SudokuDifficulty>("EASY");
  const [assisted, setAssisted] = useState(false);
  const [selected, setSelected] = useState(0);
  const [pencil, setPencil] = useState(false);
  const [message, setMessage] = useState("");
  const [announce, setAnnounce] = useState("");
  const [retry, setRetry] = useState<FinishSudokuInput | null>(null);
  const [sending, setSending] = useState(false);
  const [creditedToday, setCreditedToday] = useState(initial.credited !== null);
  const [pending, startTransition] = useTransition();
  const available = initial.availability === "AVAILABLE";
  const difficulties = tLabels("T-2681", SUDOKU_DIFFICULTIES);
  const modes = tList("T-2683");
  const modeNotes = tList("T-2684");
  const [confirmar, seguir] = tList("T-2695");

  // Retoma la partida abierta con lo que guardó este navegador, o desde las dadas si no hay nada.
  // `adopted` evita que un refresco del servidor reabra el aviso sobre la partida que se está jugando.
  useEffect(() => {
    const open = initial.open;
    if (!open || adopted.current === open.id) return;
    adopted.current = open.id;
    const play = readStored(open.id, open.givens) ?? newSudokuPlay(open.givens);
    setLive({ run: open, play, history: [] });
    setSelected(firstEmpty(play.values));
    setResuming(true);
  }, [initial.open]);

  function leave() {
    setLive(null);
    setResuming(false);
    setConfirming(false);
    setPencil(false);
    clearStored();
  }

  function fail(reason: SudokuDenial) {
    setMessage(t(ERROR_COPY[reason]));
    if (reason !== "NOT_SOLVED" && reason !== "INVALID_INPUT" && reason !== "REQUEST_CONFLICT") {
      // Con OPEN_RUN el refresco trae la partida abierta y el aviso de seguirla o abandonarla.
      if (reason !== "OPEN_RUN") leave();
      router.refresh();
    }
  }

  function send(request: FinishSudokuInput) {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    setSending(true);
    startTransition(async () => {
      try {
        const result = await onFinish(request);
        setRetry(null);
        if (result.ok) {
          leave();
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
        setSending(false);
      }
    });
  }

  function begin() {
    if (busy.current) return;
    busy.current = true;
    setMessage("");
    setAnnounce("");
    setDone(null);
    startTransition(async () => {
      try {
        const result = await onStart({ requestId: crypto.randomUUID(), difficulty, assisted });
        if (!result.ok) {
          fail(result.reason);
          return;
        }
        adopted.current = result.run.id;
        const play =
          readStored(result.run.id, result.run.givens) ?? newSudokuPlay(result.run.givens);
        setLive({ run: result.run, play, history: [] });
        setSelected(firstEmpty(play.values));
        setResuming(false);
      } catch {
        setMessage(t("T-2662"));
      } finally {
        busy.current = false;
      }
    });
  }

  function abandon() {
    if (!live || busy.current) return;
    busy.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await onAbandon({ runId: live.run.id });
        if (result.ok) {
          leave();
          setAnnounce("");
          router.refresh();
        } else {
          fail(result.reason);
        }
      } catch {
        setMessage(t("T-2662"));
      } finally {
        busy.current = false;
      }
    });
  }

  const playing = live !== null && !resuming && !confirming && !done;
  const locked = pending || retry !== null;

  function act(action: SudokuAction) {
    if (!live || !playing || locked) return;
    const next = applySudokuAction(live.play, live.run.givens, action);
    if (!next) return;
    writeStored(live.run.id, next);
    setLive({ ...live, play: next, history: [...live.history, live.play] });
    setMessage("");
    if (action.type === "hint") {
      setAnnounce(
        t("T-2705", {
          fila: Math.floor(action.cell / 9) + 1,
          columna: (action.cell % 9) + 1,
          n: action.digit,
        }),
      );
    } else if (action.type === "digit" && sudokuConflicts(next.values).has(action.cell)) {
      setAnnounce(t("T-2703", { n: action.digit }));
    } else if (
      action.type === "digit" &&
      live.run.solution &&
      live.run.solution[action.cell] !== String(action.digit)
    ) {
      setAnnounce(t("T-2704", { n: action.digit }));
    } else {
      setAnnounce("");
    }
    if (looksSolved(next.values, live.run.givens)) {
      send({ runId: live.run.id, grid: next.values, requestId: crypto.randomUUID() });
    }
  }

  function digit(value: number) {
    act({ type: pencil ? "note" : "digit", cell: selected, digit: value });
  }

  function undo() {
    if (!live || !playing || locked) return;
    const previous = live.history.at(-1);
    if (!previous) return;
    writeStored(live.run.id, previous);
    setLive({ ...live, play: previous, history: live.history.slice(0, -1) });
    setAnnounce("");
  }

  function hint() {
    const solution = live?.run.solution;
    if (!live || !solution) return;
    // Una casilla fija o que ya tiene su dígito no necesita pista.
    if (
      isSudokuCellLocked(live.play, live.run.givens, selected) ||
      live.play.values[selected] === solution[selected]
    ) {
      setAnnounce(t("T-2706"));
      return;
    }
    act({ type: "hint", cell: selected, digit: Number(solution[selected]) });
  }

  // Teclado físico: dígitos, borrar, notas y deshacer. Las flechas las atiende la grilla.
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!playing || event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      digit(Number(event.key));
    } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      act({ type: "erase", cell: selected });
    } else if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      setPencil((value) => !value);
    }
  }

  const conflicts = live ? sudokuConflicts(live.play.values) : NONE;
  const mistakes = live?.run.solution ? sudokuMistakes(live.play.values, live.run.solution) : NONE;
  const difficultyName = (value: SudokuDifficulty) => difficulties[value] ?? value;
  const solvedTotal = SUDOKU_DIFFICULTIES.reduce((sum, value) => sum + initial.solved[value], 0);

  return (
    <section
      id="sudoku"
      aria-labelledby="sudoku-title"
      className="flex flex-col gap-5 rounded-[var(--radius-cartel)] border-2 border-borde bg-fondo-alterno p-3 sm:p-6"
    >
      <header className="flex flex-col gap-2">
        <h2 id="sudoku-title" className="text-display-md">
          {t("T-2677")}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2678")}</p>
      </header>

      {live && !done ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-semibold">
          <p>
            {difficultyName(live.run.difficulty)} · {modes[live.run.assisted ? 1 : 0]}
          </p>
          <p className="text-tinta-suave">
            {t("T-2702", { n: sudokuEmptyCells(live.play.values) })}
          </p>
        </div>
      ) : null}

      {live && !resuming && !done ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: el contenedor solo escucha las teclas que burbujean desde la grilla y el teclado en pantalla, que son los controles con foco.
        <div onKeyDown={onKey}>
          <SudokuBoard
            givens={live.run.givens}
            play={live.play}
            conflicts={conflicts}
            mistakes={mistakes}
            selected={selected}
            pencil={pencil}
            assisted={live.run.assisted}
            canUndo={live.history.length > 0}
            disabled={!playing || locked}
            onSelect={setSelected}
            onDigit={digit}
            onErase={() => act({ type: "erase", cell: selected })}
            onTogglePencil={() => setPencil((value) => !value)}
            onUndo={undo}
            onHint={hint}
          />
        </div>
      ) : null}

      {done ? (
        <p className="text-sm font-semibold">{done.points > 0 ? t("T-2708") : t("T-2709")}</p>
      ) : null}

      {!live && available ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            begin();
          }}
        >
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">{t("T-2680")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {SUDOKU_DIFFICULTIES.map((value) => (
                <label
                  key={value}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-titulo px-2 text-sm font-semibold text-titulo has-checked:bg-oe-yellow has-checked:text-oe-navy has-focus-visible:outline-3 has-focus-visible:outline-oe-orange"
                >
                  <input
                    type="radio"
                    name="sudoku-difficulty"
                    value={value}
                    checked={difficulty === value}
                    onChange={() => setDifficulty(value)}
                    className="sr-only"
                  />
                  {difficultyName(value)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">{t("T-2682")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[false, true].map((value) => (
                <label
                  key={String(value)}
                  className="flex cursor-pointer flex-col gap-1 rounded-xl border-2 border-titulo p-3 text-sm text-titulo has-checked:bg-oe-yellow has-checked:text-oe-navy has-focus-visible:outline-3 has-focus-visible:outline-oe-orange"
                >
                  <input
                    type="radio"
                    name="sudoku-mode"
                    value={String(value)}
                    checked={assisted === value}
                    onChange={() => setAssisted(value)}
                    className="sr-only"
                  />
                  <span className="font-semibold">{modes[value ? 1 : 0]}</span>
                  <span>{modeNotes[value ? 1 : 0]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {creditedToday ? (
            <p className="text-sm">{t("T-2710")}</p>
          ) : (
            <div className="flex flex-col gap-1 rounded-xl border-2 border-oe-orange bg-fondo p-3 text-sm">
              <p className="font-semibold">{t("T-2685")}</p>
              <p>{t("T-2686")}</p>
            </div>
          )}
          <div>
            <button type="submit" disabled={pending} className="boton-primario">
              {pending ? t("T-2688") : done ? t("T-2711") : t("T-2687")}
            </button>
          </div>
        </form>
      ) : null}

      <output aria-live="polite" className="block min-h-6 text-sm font-semibold">
        {sending ? t("T-2707") : message || announce}
      </output>

      <div className="flex flex-wrap gap-2">
        {retry ? (
          <button type="button" onClick={() => send(retry)} className="boton-primario">
            {t("T-2663")}
          </button>
        ) : null}
        {resuming && live ? (
          <>
            <p className="w-full text-sm">
              {t("T-2691", {
                dificultad: difficultyName(live.run.difficulty),
                modo: modes[live.run.assisted ? 1 : 0] ?? "",
              })}
            </p>
            <button type="button" onClick={() => setResuming(false)} className="boton-primario">
              {t("T-2692")}
            </button>
            <button type="button" onClick={abandon} disabled={pending} className="boton-secundario">
              {t("T-2693")}
            </button>
          </>
        ) : null}
        {playing && !retry ? (
          <button type="button" onClick={() => setConfirming(true)} className="boton-secundario">
            {t("T-2693")}
          </button>
        ) : null}
        {confirming && live ? (
          <>
            <p className="w-full text-sm">{t("T-2694")}</p>
            <button type="button" onClick={abandon} disabled={pending} className="boton-primario">
              {confirmar}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="boton-secundario">
              {seguir}
            </button>
          </>
        ) : null}
      </div>

      {!available ? (
        <p className="text-sm">
          {initial.availability === "NOT_ELIGIBLE" ? t("T-2716") : t("T-2715")}
        </p>
      ) : null}

      {solvedTotal > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">{t("T-2720")}</p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1">
            {SUDOKU_DIFFICULTIES.map((value) => (
              <div key={value} className="flex gap-1">
                <dt className="text-tinta-suave">{difficultyName(value)}</dt>
                <dd className="font-semibold">{initial.solved[value]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t("T-2689")}</summary>
        <p className="mt-2 max-w-prose text-tinta-suave">{t("T-2679")}</p>
        <p className="mt-3 max-w-prose font-semibold">{t("T-3432")}</p>
      </details>
    </section>
  );
}
