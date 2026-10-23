"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  activateSubscription,
  checkSubscription,
  forgetSubscription,
  isIos,
  isPushSupported,
  isStandalone,
  registerServiceWorker,
  vapidKeyToBytes,
} from "./push-client";

type Labels = {
  enable: string;
  disable: string;
  enabled: string;
  enabledNow: string;
  blocked: string;
  unsupported: string;
  notConfigured: string;
  iosInstall: string;
  install: string;
  installed: string;
  installHint: string;
  failed: string;
};

type Props = {
  vapidPublicKey: string | null;
  /** Endpoints que el servidor tiene de la persona, unidos por salto de línea (como en PwaRegistrar). */
  serverEndpointsKey: string;
  labels: Labels;
};

type Status =
  | "checking"
  | "unsupported"
  | "not-configured"
  | "ios-install"
  | "blocked"
  | "idle"
  | "working"
  | "subscribed"
  | "just-enabled"
  | "failed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// Activar y desactivar las notificaciones en este dispositivo e instalar Mi OE (ADR-038 regla 5).
// El servidor no sabe cuál es "este" dispositivo: lo resuelve el navegador con su suscripción.
export function NotificationsPanel({ vapidPublicKey, serverEndpointsKey, labels }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [standalone, setStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isIos() && !isStandalone()) {
        setStatus("ios-install");
        return;
      }
      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }
      if (!vapidPublicKey) {
        setStatus("not-configured");
        return;
      }
      const registration = await registerServiceWorker();
      if (cancelled) {
        return;
      }
      // No basta que el navegador tenga una suscripción: «recibe» es que la casa la tenga registrada.
      // Una huérfana (local sí, en el servidor no) cae a Activar, que con el gesto la reemplaza.
      const serverEndpoints = serverEndpointsKey ? serverEndpointsKey.split("\n") : [];
      const local = registration ? await registration.pushManager.getSubscription() : null;
      const known = Boolean(local && serverEndpoints.includes(local.endpoint));
      const state = registration ? await checkSubscription(registration, serverEndpoints) : "none";
      if (cancelled) {
        return;
      }
      if (state === "subscribed") {
        setStatus("subscribed");
        if (!known) {
          router.refresh();
        }
      } else if (state === "unregistered") {
        setStatus("failed");
      } else if (Notification.permission === "denied") {
        setStatus("blocked");
      } else {
        setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, serverEndpointsKey, vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) {
      return;
    }
    setStatus("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "idle");
        return;
      }
      const registration = await registerServiceWorker();
      if (!registration) {
        setStatus("failed");
        return;
      }
      const saved = await activateSubscription(
        registration,
        vapidKeyToBytes(vapidPublicKey) as BufferSource,
      );
      setStatus(saved ? "just-enabled" : "failed");
      router.refresh();
    } catch {
      setStatus("failed");
    }
  }

  async function disable() {
    setStatus("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await forgetSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("failed");
    }
  }

  const install = installPrompt ? (
    <button
      type="button"
      className="boton-secundario"
      onClick={() => {
        installPrompt.prompt();
        setInstallPrompt(null);
      }}
    >
      {labels.install}
    </button>
  ) : standalone ? (
    <p className="text-sm text-tinta-suave">{labels.installed}</p>
  ) : (
    <p className="text-sm text-tinta-suave">{labels.installHint}</p>
  );

  let body: React.ReactNode;
  switch (status) {
    case "checking":
      body = null;
      break;
    case "ios-install":
      body = <p className="max-w-prose">{labels.iosInstall}</p>;
      break;
    case "unsupported":
      body = <p className="max-w-prose">{labels.unsupported}</p>;
      break;
    case "not-configured":
      body = <p className="max-w-prose">{labels.notConfigured}</p>;
      break;
    case "blocked":
      body = <p className="max-w-prose">{labels.blocked}</p>;
      break;
    case "subscribed":
    case "just-enabled":
      body = (
        <div className="flex flex-col items-start gap-3">
          <output className="block font-semibold text-titulo">
            {status === "just-enabled" ? labels.enabledNow : labels.enabled}
          </output>
          <button type="button" className="boton-secundario" onClick={disable}>
            {labels.disable}
          </button>
        </div>
      );
      break;
    default:
      body = (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            className="boton-primario disabled:opacity-50"
            disabled={status === "working"}
            onClick={enable}
          >
            {labels.enable}
          </button>
          {status === "failed" ? (
            <p className="rounded-lg bg-oe-orange px-2 py-1 text-sm text-oe-navy">
              {labels.failed}
            </p>
          ) : null}
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-4">
      {body}
      {status === "ios-install" ? null : install}
    </div>
  );
}
