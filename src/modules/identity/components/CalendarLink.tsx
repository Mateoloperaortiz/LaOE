"use client";

import { useId, useState } from "react";

type Props = {
  url: string;
  labels: { field: string; copy: string; copied: string; open: string };
};

// El enlace del calendario personal (ADR-038 regla 12): copiar la URL y abrirla con `webcal://`,
// que los calendarios del celular entienden como suscripción.
export function CalendarLink({ url, labels }: Props) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="eyebrow text-xs">
        {labels.field}
      </label>
      <input
        id={id}
        type="text"
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full max-w-xl rounded-xl border-2 border-borde bg-fondo px-3 py-2 font-mono text-sm text-tinta"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="boton-secundario text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {labels.copy}
        </button>
        <a href={webcal} className="boton-secundario text-sm">
          {labels.open}
        </a>
        {copied ? (
          <output className="text-sm font-semibold text-titulo">{labels.copied}</output>
        ) : null}
      </div>
    </div>
  );
}
