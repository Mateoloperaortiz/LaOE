"use client";

import { t } from "@/shared/copy/client";

// Lo que dice la pantalla de error (T-033): qué pasó y qué hacer; nunca "¡OE OE OE!" en errores. La
// pintan la raíz y cada área (ADR-122 regla 19), así que el texto está en un solo sitio. Qué dice y a
// quién avisa es la decisión abierta 42.
export function ErrorScreen({ reset }: { reset: () => void }) {
  const [headline, ...rest] = t("T-033").split(". ");
  return (
    <>
      <h1 className="text-display-lg">{headline}.</h1>
      <p className="text-lg">{rest.join(". ")}</p>
      <button type="button" onClick={reset} className="boton-secundario">
        {t("T-230")}
      </button>
    </>
  );
}

/**
 * La pantalla de error de un área (/admin, /app; ADR-123 regla 21). Next la pinta dentro del layout
 * del área, así que su navegación sigue en su sitio y no lleva contenedor principal propio: ya lo abre
 * el shell del área.
 */
export function AreaErrorScreen({ reset }: { reset: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-6 py-8">
      <ErrorScreen reset={reset} />
    </div>
  );
}
