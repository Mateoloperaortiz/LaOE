"use client";

import { useEffect, useState } from "react";

// Reloj de la rotación en curso (ADR-089 regla 9). Cuenta hacia `endsAt` corrigiendo el reloj del
// navegador con la hora del servidor, así un celular con la hora mal no cambia el tiempo. No se anuncia
// segundo a segundo a los lectores de pantalla.

type Props = {
  endsAt: string;
  serverNow: string;
  labels: { left: string; done: string };
  className?: string;
};

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Cronometro({ endsAt, serverNow, labels, className }: Props) {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(timer);
  }, [offset]);
  const left = new Date(endsAt).getTime() - now;
  return (
    <p className={className} aria-live="off">
      {left > 0 ? (
        <>
          <span className="sr-only">{labels.left} </span>
          <span className="tabular-nums">{format(left)}</span>
        </>
      ) : (
        labels.done
      )}
    </p>
  );
}
