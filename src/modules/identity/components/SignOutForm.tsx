"use client";

import type { ReactNode } from "react";
import { signOutAction } from "@/modules/identity/actions";
import { readPushEndpoint } from "@/shared/ui/push-endpoint";

// Cerrar sesión retira el dispositivo (ADR-118 regla 17): antes de salir, el navegador le dice a la casa
// cuál es su suscripción push, para que la fila deje de estar a nombre de quien sale. No la suelta: que
// entrar la vuelva a registrar sin gesto es la conducta de hoy (decisión abierta 43). Es la única
// salida: los tres «Cerrar sesión» pasan por acá. Si el navegador no responde, la salida sigue.
export function SignOutForm({ children }: { children: ReactNode }) {
  return (
    <form
      action={async () => {
        await signOutAction(await readPushEndpoint());
      }}
    >
      {children}
    </form>
  );
}
