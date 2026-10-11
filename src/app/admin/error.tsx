"use client";

import { ErrorScreen } from "@/shared/ui/ErrorScreen";

type Props = { reset: () => void };

// Error en una página de /admin (ADR-122 regla 19): Next lo pinta dentro del layout del área, así que
// su navegación sigue en su sitio. Misma pantalla que la raíz, sin contenedor principal propio: ya lo
// abre `AdminShell`.
export default function AdminErrorPage({ reset }: Props) {
  return (
    <div className="flex max-w-2xl flex-col items-start gap-6 py-8">
      <ErrorScreen reset={reset} />
    </div>
  );
}
