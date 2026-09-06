"use client";

import { useEffect, useState } from "react";
import { isPushSupported } from "./push-client";

type Props = { endpoint: string; label: string };

// Marca "este dispositivo" en la lista de Ajustes: solo el navegador sabe cuál es su suscripción.
export function DeviceMark({ endpoint, label }: Props) {
  const [mine, setMine] = useState(false);
  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled && subscription?.endpoint === endpoint) {
          setMine(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [endpoint]);
  if (!mine) {
    return null;
  }
  return (
    <span className="eyebrow inline-flex items-center rounded-full bg-oe-yellow px-3 py-1 text-xs text-oe-navy">
      {label}
    </span>
  );
}
