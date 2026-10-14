"use client";

import { AreaErrorScreen } from "@/shared/ui/ErrorScreen";

type Props = { reset: () => void };

// Error en una página de /admin (ADR-122 regla 19): Next lo pinta dentro del layout del área, así que
// su navegación sigue en su sitio. Misma pantalla que la raíz, sin contenedor principal propio: ya lo
// abre `AdminShell`. El contenedor de un área está escrito una vez, en `AreaErrorScreen`.
export default function AdminErrorPage({ reset }: Props) {
  return <AreaErrorScreen reset={reset} />;
}
