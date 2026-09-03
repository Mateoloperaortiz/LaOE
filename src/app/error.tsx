"use client";

import { t } from "@/shared/copy";

type Props = { reset: () => void };

// Error del servidor (T-033): dice qué pasó y qué hacer; nunca "¡OE OE OE!" en errores.
export default function ErrorPage({ reset }: Props) {
  const [mensaje, ...resto] = t("T-033").split(". ");
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <h1 className="text-display-lg">{mensaje}.</h1>
      <p className="text-lg">{resto.join(". ")}</p>
      <button type="button" onClick={reset} className="boton-secundario">
        {t("T-230")}
      </button>
    </main>
  );
}
