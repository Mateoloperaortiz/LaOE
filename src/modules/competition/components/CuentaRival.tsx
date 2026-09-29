"use client";

import { useEffect, useState } from "react";

// «El adversario empieza 1 min tarde» (ADR-098 regla 2): cuánto le falta al rival para arrancar. Cuenta
// hacia `startsAt` con la hora del servidor, que sale del inicio guardado de la base, así que recargar
// la página no la reinicia. Solo el estado es región viva: se anuncia al cambiar, no cada segundo.

type Props = {
  startsAt: string;
  serverNow: string;
  labels: { waiting: string; ready: string };
};

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function CuentaRival({ startsAt, serverNow, labels }: Props) {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  const left = new Date(startsAt).getTime() - now;
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border-2 border-oe-orange px-3 py-2">
      <output className="block font-semibold">{left > 0 ? labels.waiting : labels.ready}</output>
      {left > 0 ? <p className="text-display-md tabular-nums">{format(left)}</p> : null}
    </div>
  );
}
