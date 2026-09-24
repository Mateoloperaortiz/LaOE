"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Refresca la página del servidor cada pocos segundos mientras la pestaña está visible (ADR-089): la
// pantalla del juez y la mesa de control ven la rotación nueva sin recargar a mano. Sin websockets.

export function Actualizador({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
