"use client";

import { useEffect, useState } from "react";
import { labelsFromProps, tLabels } from "@/shared/copy/client";
import { afterPoll, type LiveStatus, showsAsCurrent } from "./console-live";

// Contador en vivo (ADR-035 regla 16): pide el JSON de la ocasión cada pocos segundos, se pausa con
// la pestaña oculta y redibuja el QR con el código rotativo vigente. Sin websockets. Si un sondeo
// responde con error, avisa y deja de mostrar el QR, el código y el enlace que lo lleva hasta que la
// casa vuelva a responder (ADR-122 regla 14, `console-live.ts`).

export interface LiveData {
  status: string;
  counts: Record<string, number>;
  recent: Array<{ id: string; name: string; at: string; source: string; status: string }>;
  code: { value: string; secondsLeft: number } | null;
  link: string;
  qrSvg: string;
  generatedAt: string;
}

type Labels = {
  qrTitle: string;
  qrAlt: string;
  link: string; // con {url}
  code: string; // con {codigo} y {s}
  stale: string; // lo que se mostraba dejó de valer
  recentTitle: string;
  recentEmpty: string;
  sources: Record<string, string>; // la etiqueta de cada fuente, por valor (T-596)
  statuses: Record<string, string>; // la de cada estado que la consola nombra (T-597)
};

type Props = {
  occasionId: string;
  initial: LiveData;
  labels: Labels;
  intervalMs?: number;
  locale: string;
  timeZone: string;
};

// Los contadores, en el orden de la pantalla, y el título de cada uno por valor (T-585: Registrados ·
// Pendientes · Rechazados · Anulados). El componente conoce ese orden, así que arma su par acá y no
// lo recibe por props (ADR-126 regla 5). Las etiquetas de estado y de fuente sí llegan por props.
const COUNTER_ORDER = ["APPROVED", "PENDING", "REJECTED", "CANCELLED"] as const;
const COUNTER_LABELS = tLabels("T-585", COUNTER_ORDER);

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z]+)\}/g, (match, key: string) => values[key] ?? match);
}

export function ConsolaEnVivo({
  occasionId,
  initial,
  labels,
  intervalMs = 4000,
  locale,
  timeZone,
}: Props) {
  const [data, setData] = useState<LiveData>(initial);
  const [secondsLeft, setSecondsLeft] = useState(initial.code?.secondsLeft ?? 0);
  const [status, setStatus] = useState<LiveStatus>("live");
  // Llegaron por props como objetos llanos: sin prototipo, un valor ajeno cae al respaldo.
  const sources = labelsFromProps(labels.sources);
  const statuses = labelsFromProps(labels.statuses);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (document.visibilityState === "hidden") {
        return;
      }
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/ocasiones/${occasionId}/live`, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) {
          // Sesión vencida o revocada, permiso retirado, ocasión borrada o un fallo de la casa.
          if (!cancelled) setStatus((previous) => afterPoll(previous, "rejected"));
          return;
        }
        const next = (await response.json()) as LiveData;
        if (!cancelled) {
          setData(next);
          setSecondsLeft(next.code?.secondsLeft ?? 0);
          setStatus((previous) => afterPoll(previous, "fresh"));
        }
      } catch {
        // Abortado por el sondeo siguiente o al desmontar: no dice nada de la casa. Sin red: el
        // próximo tick lo intenta de nuevo y el código vale lo que le quede a su cuenta.
        if (!cancelled && !request.signal.aborted) {
          setStatus((previous) => afterPoll(previous, "unreachable"));
        }
      }
    }
    const poll = setInterval(refresh, intervalMs);
    const tick = setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [occasionId, intervalMs]);

  const time = new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" });
  const current = showsAsCurrent(status, data.code ? { secondsLeft } : null);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section
        aria-label={labels.qrTitle}
        className="flex flex-col items-center gap-4 rounded-[var(--radius-cartel)] border border-borde bg-white p-6 text-oe-navy"
      >
        <h2 className="text-display-md text-center">{labels.qrTitle}</h2>
        {current ? (
          <>
            <div
              role="img"
              aria-label={labels.qrAlt}
              className="w-full max-w-md [&_svg]:size-full"
              data-link={data.link}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generado en servidor por `qrcode`, sin datos externos
              dangerouslySetInnerHTML={{ __html: data.qrSvg }}
            />
            {data.code ? (
              <p className="font-display text-display-md tabular-nums" aria-live="polite">
                {fill(labels.code, { codigo: data.code.value, s: String(secondsLeft) })}
              </p>
            ) : null}
            {/* El enlace es lo que codifica el QR y lleva el código en claro (`?c=`): se va con ellos. */}
            <p className="break-all text-center text-sm text-oe-navy/70">
              {fill(labels.link, { url: data.link })}
            </p>
          </>
        ) : (
          <p
            role="alert"
            className="rounded-lg bg-oe-orange px-3 py-2 text-center font-semibold text-oe-navy"
          >
            {labels.stale}
          </p>
        )}
      </section>
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-4" aria-live="polite">
          {COUNTER_ORDER.map((status) => (
            <div
              key={status}
              className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
            >
              <dt className="eyebrow text-xs">{COUNTER_LABELS[status] ?? status}</dt>
              <dd className="font-display text-display-lg leading-none" data-contador={status}>
                {data.counts[status] ?? 0}
              </dd>
            </div>
          ))}
        </dl>
        <section aria-label={labels.recentTitle} className="flex flex-col gap-2">
          <h2 className="eyebrow text-xs">{labels.recentTitle}</h2>
          {data.recent.length === 0 ? (
            <p className="text-tinta-suave">{labels.recentEmpty}</p>
          ) : (
            <ul className="flex list-none flex-col gap-1 p-0">
              {data.recent.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 border-borde border-b py-1 text-sm"
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-tinta-suave">
                    {time.format(new Date(item.at))} · {sources[item.source] ?? item.source} ·{" "}
                    {statuses[item.status] ?? item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
