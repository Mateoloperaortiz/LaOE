"use client";

import { t } from "@/shared/copy/client";
import { Button } from "@/shared/ui/Button";
import { ErrorState } from "@/shared/ui/States";

// Lo que dice la pantalla de error (T-033): qué pasó y qué hacer; nunca "¡OE OE OE!" en errores. La
// pintan la raíz y cada área (ADR-122 regla 19), así que el texto está en un solo sitio. Qué dice y a
// quién avisa es la decisión abierta 42. Es un estado de la capa funcional (`ErrorState`, tramo R6-C):
// la primera oración es el título y el resto, la explicación.
export function ErrorScreen({
  reset,
  area = "mi-oe",
}: {
  reset: () => void;
  /** El área solo cambia el tamaño del botón: 44 px en Mi OE y fuera de las áreas, 40 en la Operación. */
  area?: "mi-oe" | "operacion";
}) {
  const [headline, ...rest] = t("T-033").split(". ");
  return (
    <ErrorState
      title={`${headline}.`}
      titleAs="h1"
      description={rest.join(". ")}
      action={
        <Button variant="secundaria" area={area} onClick={reset}>
          {t("T-230")}
        </Button>
      }
    />
  );
}

/**
 * La pantalla de error de un área (/admin, /app; ADR-123 regla 21): la de la raíz dentro de su
 * contenedor. Next la pinta dentro del layout del área, así que su navegación sigue en su sitio y no
 * lleva contenedor principal propio: ya lo abre el shell del área.
 */
export function AreaErrorScreen({
  reset,
  area = "mi-oe",
}: {
  reset: () => void;
  area?: "mi-oe" | "operacion";
}) {
  return (
    <div className="max-w-2xl py-2">
      <ErrorScreen reset={reset} area={area} />
    </div>
  );
}
