"use client";

import { type KeyboardEvent, useRef } from "react";
import { t, tList } from "@/shared/copy/client";
import { ArrowBackUpIcon } from "@/shared/ui/icons/ArrowBackUpIcon";
import { BulbIcon } from "@/shared/ui/icons/BulbIcon";
import { EraserIcon } from "@/shared/ui/icons/EraserIcon";
import { ExclamationMarkIcon } from "@/shared/ui/icons/ExclamationMarkIcon";
import { PencilIcon } from "@/shared/ui/icons/PencilIcon";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { SUDOKU_PEERS } from "../sudoku-engine";
import { isSudokuCellLocked, sudokuNoteDigits } from "../sudoku-play";
import type { SudokuPlay } from "../sudoku-types";

// Grilla y teclado del Sudoku (ADR-078 regla 16). Solo presenta: el estado vive en `Sudoku.tsx`.
// La grilla es una sola parada de tabulador con foco itinerante; ningún estado va solo en color.

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const STEP: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
// Icono arriba y texto abajo: a 390 px cuatro controles en fila no caben con el icono al lado.
const CONTROL = "boton-secundario flex-col gap-0.5 rounded-2xl px-1 py-1.5 text-xs";

type Props = {
  givens: string;
  play: SudokuPlay;
  /** Casillas con un dígito repetido en su fila, columna o caja. */
  conflicts: ReadonlySet<number>;
  /** Solo con ayudas: casillas cuyo dígito no es el de la solución. */
  mistakes: ReadonlySet<number>;
  selected: number;
  pencil: boolean;
  assisted: boolean;
  canUndo: boolean;
  disabled: boolean;
  onSelect: (cell: number) => void;
  onDigit: (digit: number) => void;
  onErase: () => void;
  onTogglePencil: () => void;
  onUndo: () => void;
  onHint: () => void;
};

export function SudokuBoard({
  givens,
  play,
  conflicts,
  mistakes,
  selected,
  pencil,
  assisted,
  canUndo,
  disabled,
  onSelect,
  onDigit,
  onErase,
  onTogglePencil,
  onUndo,
  onHint,
}: Props) {
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const states = tList("T-2698");
  const [borrar, lapiz, deshacer, pista] = tList("T-2701");
  const related = new Set(SUDOKU_PEERS[selected]);
  const selectedDigit = play.values[selected] ?? "0";

  function labelFor(cell: number): string {
    const digit = play.values[cell] ?? "0";
    const parts: string[] = [];
    if (digit === "0") {
      const notes = sudokuNoteDigits(play.notes[cell] ?? 0);
      parts.push(notes.length > 0 ? t("T-2699", { notas: notes.join(", ") }) : (states[0] ?? ""));
    } else {
      parts.push(digit);
      if (givens[cell] !== "0") parts.push(states[1] ?? "");
      if (play.hinted.includes(cell)) parts.push(states[4] ?? "");
      if (conflicts.has(cell)) parts.push(states[2] ?? "");
      if (mistakes.has(cell)) parts.push(states[3] ?? "");
    }
    return t("T-2697", {
      fila: Math.floor(cell / 9) + 1,
      columna: (cell % 9) + 1,
      contenido: parts.join(", "),
    });
  }

  function cellClass(cell: number): string {
    const digit = play.values[cell] ?? "0";
    const given = givens[cell] !== "0";
    const tone =
      cell === selected
        ? "bg-oe-yellow text-oe-navy"
        : digit !== "0" && digit === selectedDigit
          ? "bg-oe-blue text-oe-navy"
          : related.has(cell)
            ? given
              ? "bg-fondo-suave text-titulo"
              : "bg-oe-yellow/25 text-enlace"
            : given
              ? "bg-fondo-suave text-titulo"
              : "bg-fondo text-enlace";
    return `relative flex aspect-square w-full cursor-pointer select-none items-center justify-center text-lg tabular-nums outline-offset-[-3px] focus-visible:outline-3 focus-visible:outline-oe-orange motion-safe:transition-colors sm:text-2xl ${
      given ? "font-extrabold" : "font-medium"
    } ${tone}`;
  }

  // Las flechas mueven la selección y el foco juntos; el resto de las teclas las atiende `Sudoku`.
  function onGridKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = STEP[event.key];
    if (step === undefined || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const column = selected % 9;
    if ((step === -1 && column === 0) || (step === 1 && column === 8)) return;
    const next = selected + step;
    if (next < 0 || next > 80) return;
    onSelect(next);
    cells.current[next]?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      {/* Grilla ARIA con el foco en las casillas (patrón de grilla de datos de la guía de autoría
          ARIA). El rol no es cosmético: hace que el lector de pantalla entre en modo foco y los
          dígitos lleguen a la página en vez de saltar entre encabezados (ADR-078 regla 16). HTML no
          tiene un elemento para una grilla interactiva, y una tabla con estos roles también la
          objeta Biome, así que las supresiones de abajo son una sola decisión. */}
      {/* biome-ignore lint/a11y/useSemanticElements: una grilla interactiva no tiene elemento HTML propio. */}
      <div
        role="grid"
        aria-label={t("T-2696")}
        onKeyDown={onGridKey}
        className="w-full border-[3px] border-titulo"
      >
        {ROWS.map((row) => (
          // biome-ignore lint/a11y/useSemanticElements: fila de la grilla ARIA de arriba.
          // biome-ignore lint/a11y/useFocusableInteractive: en una grilla el foco va en las casillas, no en las filas.
          <div role="row" key={row} className="grid grid-cols-9">
            {ROWS.map((column) => {
              const cell = row * 9 + column;
              const digit = play.values[cell] ?? "0";
              const notes = digit === "0" ? (play.notes[cell] ?? 0) : 0;
              return (
                // biome-ignore lint/a11y/useSemanticElements: casilla de la grilla ARIA de arriba.
                // biome-ignore lint/a11y/useKeyWithClickEvents: las teclas las atiende la grilla, que es quien mueve el foco.
                <div
                  role="gridcell"
                  key={column}
                  ref={(node) => {
                    cells.current[cell] = node;
                  }}
                  // Foco itinerante: la grilla es una sola parada de tabulador.
                  tabIndex={cell === selected ? 0 : -1}
                  aria-label={labelFor(cell)}
                  aria-selected={cell === selected}
                  aria-readonly={isSudokuCellLocked(play, givens, cell)}
                  aria-invalid={conflicts.has(cell) || mistakes.has(cell)}
                  onClick={() => onSelect(cell)}
                  onFocus={() => onSelect(cell)}
                  className={`${cellClass(cell)} border border-borde ${
                    column % 3 === 2 && column !== 8 ? "border-r-[3px] border-r-titulo" : ""
                  } ${row % 3 === 2 && row !== 8 ? "border-b-[3px] border-b-titulo" : ""}`}
                >
                  {digit !== "0" ? (
                    <span aria-hidden="true">{digit}</span>
                  ) : notes !== 0 ? (
                    <span
                      aria-hidden="true"
                      className={`grid h-full w-full grid-cols-3 place-items-center p-px text-[0.5625rem] leading-none font-semibold sm:text-xs ${
                        cell === selected ? "text-oe-navy" : "text-tinta-suave"
                      }`}
                    >
                      {DIGITS.map((note) => (
                        <span key={note}>{notes & (1 << (note - 1)) ? note : ""}</span>
                      ))}
                    </span>
                  ) : null}
                  {conflicts.has(cell) ? (
                    <ExclamationMarkIcon
                      size={11}
                      stroke={3.5}
                      className="absolute top-0 right-0 rounded-bl bg-oe-orange text-oe-navy"
                    />
                  ) : mistakes.has(cell) ? (
                    <XIcon
                      size={11}
                      stroke={3.5}
                      className="absolute top-0 right-0 rounded-bl bg-oe-navy text-oe-paper"
                    />
                  ) : play.hinted.includes(cell) ? (
                    <BulbIcon size={11} stroke={2.5} className="absolute top-0.5 right-0.5" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <fieldset disabled={disabled} className="flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">{t("T-2700")}</legend>
        <div className="grid grid-cols-9 gap-1">
          {DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => onDigit(digit)}
              // Con los nueve puestos ya no queda dónde escribirlo; como nota sigue sirviendo.
              disabled={!pencil && play.values.split(String(digit)).length - 1 >= 9}
              className="flex min-h-12 items-center justify-center rounded-xl border-2 border-titulo text-xl font-semibold text-titulo tabular-nums hover:bg-fondo-suave disabled:border-borde disabled:text-tinta-suave"
            >
              {digit}
            </button>
          ))}
        </div>
        <div className={`grid gap-2 ${assisted ? "grid-cols-4" : "grid-cols-3"}`}>
          <button type="button" onClick={onErase} className={CONTROL}>
            <EraserIcon />
            {borrar}
          </button>
          <button
            type="button"
            aria-pressed={pencil}
            onClick={onTogglePencil}
            className={`${CONTROL} ${pencil ? "bg-oe-yellow text-oe-navy" : ""}`}
          >
            <PencilIcon />
            {lapiz}
          </button>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`${CONTROL} disabled:border-borde disabled:text-tinta-suave`}
          >
            <ArrowBackUpIcon />
            {deshacer}
          </button>
          {assisted ? (
            <button type="button" onClick={onHint} className={CONTROL}>
              <BulbIcon />
              {pista}
            </button>
          ) : null}
        </div>
      </fieldset>
    </div>
  );
}
