"use client";

import type { ReactNode } from "react";
import { signOutAction } from "@/modules/identity/actions";
import { t } from "@/shared/copy/client";
import { readPushEndpoint } from "@/shared/ui/push-endpoint";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";

// Cerrar sesión retira el dispositivo (ADR-118 regla 17): antes de salir, el navegador le dice a la casa
// cuál es su suscripción push, para que la fila deje de estar a nombre de quien sale. No la suelta: que
// entrar la vuelva a registrar sin gesto es la conducta de hoy (decisión abierta 43). Es la única
// salida: los tres «Cerrar sesión» pasan por acá. Si el navegador no responde, la salida sigue. Si el
// pedido de salida no llega a la casa, el formulario lo dice y sigue montado para reintentar (ADR-122
// regla 17): no cae a la pantalla de error.
export function SignOutForm({ children }: { children: ReactNode }) {
  const [failure, signOut] = useGuardedActionState<string, FormData>(
    async () => {
      await signOutAction(await readPushEndpoint());
      return "";
    },
    "",
    () => t("T-3263"),
  );
  return (
    <form action={signOut}>
      {children}
      {failure ? (
        <p role="alert" className="mt-2 max-w-xs text-sm font-semibold">
          {failure}
        </p>
      ) : null}
    </form>
  );
}
