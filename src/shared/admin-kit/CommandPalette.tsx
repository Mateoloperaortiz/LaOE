"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/shared/copy/client";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";
import { AppLink } from "@/shared/ui/AppLink";

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
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const base = useId();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry vuelve a ejecutar una búsqueda idéntica por pedido explícito.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setFailed(false);
    setResults([]);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search");
        const body = (await response.json()) as { results: PaletteResult[] };
        if (controller.signal.aborted) return;
        setResults(body.results);
        setActive(0);
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, endpoint, retry]);

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
        router.push(target.href, {
          scroll: !preservePageScroll(
            target.href,
            window.location.pathname,
            window.location.origin,
          ),
        });
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="boton-secundario min-h-10 px-4 py-2 text-sm"
        aria-label={labels.open}
        aria-haspopup="dialog"
      >
        {t("T-1405")}
        <kbd className="hidden text-xs text-tinta-suave lg:inline">⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label={labels.open}
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
              aria-describedby={`${base}-status`}
              autoFocus
              className="min-w-0 flex-1 rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-lg focus:border-titulo focus:outline-none"
            />
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="boton-secundario min-h-10 px-3 py-1 text-sm"
            >
              {labels.close}
            </button>
          </div>
          <output id={`${base}-status`} className="text-sm text-tinta-suave">
            {searching
              ? t("T-1406")
              : failed
                ? t("T-1407")
                : query.trim().length < 2
                  ? t("T-1408")
                  : (results[active]?.title ?? labels.empty)}
          </output>
          {failed ? (
            <button type="button" className="boton-secundario" onClick={() => setRetry(retry + 1)}>
              {t("T-1409")}
            </button>
          ) : null}
          <ul
            className="flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0"
            aria-busy={searching}
          >
            {results.map((result, index) => (
              <li key={`${result.type}-${result.id}`}>
                <AppLink
                  href={result.href}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 no-underline ${index === active ? "bg-fondo-suave" : ""}`}
                  onNavigate={() => dialog.current?.close()}
                  onMouseEnter={() => setActive(index)}
                  aria-current={index === active ? "true" : undefined}
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
                </AppLink>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
