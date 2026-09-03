"use client";

import { useEffect, useRef, useState } from "react";

export interface PaletteResult {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

type Props = {
  endpoint: string;
  labels: {
    open: string;
    placeholder: string;
    empty: string;
    close: string;
    types: Record<string, string>;
  };
};

// Paleta ⌘K (ADR-017): busca en el servidor con pg_trgm y navega con el teclado.
export function CommandPalette({ endpoint, labels }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { results: PaletteResult[] };
        setResults(body.results);
        setActive(0);
      } catch {
        // Búsqueda cancelada o fallida: se conserva la lista anterior.
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, endpoint]);

  function onInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      const target = results[active];
      if (target) {
        event.preventDefault();
        dialog.current?.close();
        window.location.assign(target.href);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="boton-secundario min-h-10 px-4 py-2 text-sm"
      >
        {labels.open}
      </button>
      <dialog
        ref={dialog}
        className="m-auto w-[min(40rem,92vw)] rounded-[var(--radius-cartel)] border border-borde bg-fondo p-0 text-tinta shadow-2xl backdrop:bg-oe-navy/60"
        onClose={() => setQuery("")}
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKey}
              placeholder={labels.placeholder}
              aria-label={labels.placeholder}
              autoFocus
              className="flex-1 rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-lg focus:border-titulo focus:outline-none"
            />
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="boton-secundario min-h-10 px-3 py-1 text-sm"
            >
              {labels.close}
            </button>
          </div>
          <ul
            className="flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0"
            aria-busy={searching}
          >
            {results.map((result, index) => (
              <li key={`${result.type}-${result.id}`}>
                <a
                  href={result.href}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 no-underline ${index === active ? "bg-fondo-suave" : ""}`}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-titulo">{result.title}</span>
                    {result.subtitle ? (
                      <span className="text-xs text-tinta-suave">{result.subtitle}</span>
                    ) : null}
                  </span>
                  <span className="eyebrow text-xs text-tinta-suave">
                    {labels.types[result.type] ?? result.type}
                  </span>
                </a>
              </li>
            ))}
            {query.trim().length >= 2 && !searching && results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-tinta-suave">{labels.empty}</li>
            ) : null}
          </ul>
        </div>
      </dialog>
    </>
  );
}
