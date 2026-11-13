"use client";

import { useEffect } from "react";

// Vibración corta de un momento de marca (ADR-160 regla 5): una sola vez por momento, recordado en
// `localStorage` por su clave, y nunca con movimiento reducido. Es una comodidad: sin almacenamiento
// o sin `navigator.vibrate` (iOS no lo tiene) no pasa nada.

const PATTERN = [40, 60, 40];

export function VibrarUnaVez({ clave }: { clave: string }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const key = `momento:${clave}`;
    try {
      if (window.localStorage.getItem(key) !== null) {
        return;
      }
      window.localStorage.setItem(key, "1");
    } catch {
      return;
    }
    navigator.vibrate?.(PATTERN);
  }, [clave]);
  return null;
}
