"use client";

import { useState, useTransition } from "react";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";

// Kanban de un pipeline (ADR-037 regla 7): columnas por etapa; cada tarjeta se mueve con "Mover a…"
// (selector y botón, sin JS) o arrastrándola a otra columna con la API nativa del navegador. Las dos
// vías llaman a la misma acción de servidor.

export interface KanbanCard {
  id: string;
  title: string;
  subject: string;
  edition: string | null;
  /** Monto ya formateado (patrocinios). */
  amount: string | null;
  owner: string | null;
  days: number;
  closedAt: string | null;
  href: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
  cards: KanbanCard[];
}

export interface KanbanProps {
  columns: KanbanColumn[];
  returnTo: string;
  moveAction: (formData: FormData) => Promise<void>;
}

export function Kanban({ columns, returnTo, moveAction }: KanbanProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [moverA, mover] = tList("T-971");
  const [ganada, perdida, cerrada] = tList("T-981");

  function drop(stageId: string) {
    const cardId = dragging;
    setDragging(null);
    setOver(null);
    if (!cardId) {
      return;
    }
    const current = columns.find((column) => column.cards.some((card) => card.id === cardId));
    if (current?.id === stageId) {
      return;
    }
    const formData = new FormData();
    formData.set("cardId", cardId);
    formData.set("stageId", stageId);
    formData.set("returnTo", returnTo);
    startTransition(() => moveAction(formData));
  }

  return (
    // El contenedor se desplaza a lo ancho: como región con tabIndex el teclado también lo alcanza (axe).
    <section
      className="flex gap-4 overflow-x-auto pb-4"
      aria-busy={pending}
      aria-label={t("T-977")}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: región desplazable que el teclado debe poder recorrer
      tabIndex={0}
    >
      <p className="sr-only">{t("T-993")}</p>
      {columns.map((column) => (
        <section
          key={column.id}
          aria-label={column.name}
          onDragOver={(event) => {
            if (dragging) {
              event.preventDefault();
              setOver(column.id);
            }
          }}
          onDragLeave={() => setOver((value) => (value === column.id ? null : value))}
          onDrop={(event) => {
            event.preventDefault();
            drop(column.id);
          }}
          className={`flex w-72 shrink-0 flex-col gap-3 rounded-[var(--radius-cartel)] border bg-fondo-suave p-3 ${
            over === column.id ? "border-oe-blue" : "border-borde"
          }`}
        >
          <header className="flex items-center justify-between gap-2">
            <h2 className="text-display-sm">{column.name}</h2>
            <span className="text-sm text-tinta-suave">{column.cards.length}</span>
          </header>
          {column.isWon || column.isLost ? (
            <span className="eyebrow text-xs text-tinta-suave">
              {column.isWon ? ganada : perdida}
            </span>
          ) : null}
          {column.cards.length === 0 ? (
            <p className="text-sm text-tinta-suave">{t("T-970")}</p>
          ) : null}
          <ul className="flex list-none flex-col gap-3 p-0">
            {column.cards.map((card) => (
              <li
                key={card.id}
                draggable
                onDragStart={() => setDragging(card.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className={`flex flex-col gap-2 rounded-xl border border-borde bg-fondo p-3 ${
                  dragging === card.id ? "opacity-50" : ""
                }`}
              >
                <a
                  href={card.href}
                  className="font-semibold text-titulo no-underline hover:underline"
                >
                  {card.title}
                </a>
                {card.subject !== card.title || card.edition || card.amount ? (
                  <p className="text-sm text-tinta-suave">
                    {[card.subject !== card.title ? card.subject : null, card.edition, card.amount]
                      .filter((item) => item)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="text-xs text-tinta-suave">
                  {card.closedAt
                    ? cerrada.replace("{fecha}", card.closedAt)
                    : t("T-982", { n: card.days })}
                  {card.owner ? ` · ${card.owner}` : ` · ${t("T-1060")}`}
                </p>
                <details className="mt-1">
                  <summary className="cursor-pointer rounded-lg py-2 text-sm font-semibold text-titulo">
                    {moverA}
                  </summary>
                  <ActionForm action={moveAction} className="flex items-center gap-2 pt-2">
                    <AdminFormBody>
                      <input type="hidden" name="cardId" value={card.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <label htmlFor={`mover-${card.id}`} className="sr-only">
                        {moverA}
                      </label>
                      <select
                        id={`mover-${card.id}`}
                        name="stageId"
                        defaultValue={column.id}
                        className="min-w-0 flex-1 rounded-lg border border-borde bg-fondo px-2 py-1 text-sm"
                      >
                        {columns.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name}
                          </option>
                        ))}
                      </select>
                      <AdminSubmitButton
                        type="submit"
                        className="boton-secundario min-h-8 px-3 py-1 text-xs"
                      >
                        {mover}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
