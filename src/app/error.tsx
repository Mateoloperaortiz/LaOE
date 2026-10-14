"use client";

import { ErrorScreen } from "@/shared/ui/ErrorScreen";

type Props = { reset: () => void };

// Error del servidor fuera de las áreas: reemplaza todo lo que va debajo del layout raíz. /admin y
// /app tienen el suyo, que conserva su navegación (ADR-122 regla 19).
export default function ErrorPage({ reset }: Props) {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <ErrorScreen reset={reset} />
    </main>
  );
}
