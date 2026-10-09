"use client";

import type { ReactNode } from "react";
import { releaseBrowserSubscription } from "@/modules/comms/components/push-client";
import { signOutAction } from "@/modules/identity/actions";

// Cerrar sesión retira el dispositivo (ADR-118 regla 17): antes de salir, el navegador suelta su
// suscripción push y le dice a la casa cuál era, para que la fila deje de estar a nombre de quien sale.
// Es la única salida: los tres «Cerrar sesión» pasan por acá. Si el navegador no responde, la salida sigue.
// Vive en `src/app` porque compone dos módulos: la suscripción es de `comms` y la sesión de `identity`.
export function SignOutForm({ children }: { children: ReactNode }) {
  return (
    <form
      action={async () => {
        await signOutAction(await releaseBrowserSubscription());
      }}
    >
      {children}
    </form>
  );
}
