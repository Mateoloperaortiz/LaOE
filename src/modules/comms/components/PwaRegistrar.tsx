"use client";

import { useEffect } from "react";
import { isPushSupported, registerServiceWorker, saveSubscription } from "./push-client";

type Props = {
  /** Endpoints registrados para la persona: si el de este navegador no está, se vuelve a registrar. */
  endpointsKey: string;
};

// Registra el service worker en Mi OE (ADR-038 regla 4) y, si este navegador ya tiene una suscripción
// que el servidor no conoce (otra persona entró antes, o se limpió), la registra para el actor.
export function PwaRegistrar({ endpointsKey }: Props) {
  useEffect(() => {
    if (!isPushSupported()) {
      return;
    }
    let cancelled = false;
    (async () => {
      const registration = await registerServiceWorker();
      if (!registration || cancelled) {
        return;
      }
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || cancelled) {
        return;
      }
      const known = endpointsKey.split("\n").includes(subscription.endpoint);
      if (!known) {
        await saveSubscription(subscription);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpointsKey]);
  return null;
}
