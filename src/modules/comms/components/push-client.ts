// Helpers del navegador para el push (ADR-038 reglas 4 y 5): solo corren en componentes cliente.

export const SW_PATH = "/sw.js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isIos(): boolean {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** Registra el service worker una vez por carga; devuelve el registro listo. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) {
    return null;
  }
  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: "/", updateViaCache: "none" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** La clave pública VAPID (base64url) como bytes, que es lo que pide `pushManager.subscribe`. */
export function vapidKeyToBytes(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function postSubscription(
  subscription: PushSubscription,
): Promise<"saved" | "taken" | "failed"> {
  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (response.ok) {
    return "saved";
  }
  return response.status === 409 ? "taken" : "failed";
}

/**
 * Registra la suscripción de este navegador para quien tiene la sesión. Si el servidor responde que el
 * endpoint ya es de otra persona (otra cuenta activó las notificaciones acá), la casa no lo reasigna
 * (ADR-113 regla 6): el navegador suelta esa suscripción, pide una nueva, que trae su propio endpoint,
 * y registra esa. La anterior deja de existir en el servicio de push y se borra sola en el próximo envío.
 */
export async function saveSubscription(
  registration: ServiceWorkerRegistration,
  subscription: PushSubscription,
): Promise<boolean> {
  const first = await postSubscription(subscription);
  if (first !== "taken") {
    return first === "saved";
  }
  try {
    const applicationServerKey = subscription.options.applicationServerKey;
    await subscription.unsubscribe();
    if (!applicationServerKey) {
      return false;
    }
    const renewed = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    return (await postSubscription(renewed)) === "saved";
  } catch {
    return false;
  }
}

export type SubscriptionState = "subscribed" | "none" | "unregistered";

/**
 * Qué sabe la casa de la suscripción de este navegador. Tener una local no basta para decir que este
 * dispositivo recibe: si el servidor no la conoce se le registra en el acto, y si tampoco la acepta es
 * una suscripción huérfana (el navegador cree que recibe y la casa no tiene a dónde enviar).
 */
export async function checkSubscription(
  registration: ServiceWorkerRegistration,
  serverEndpoints: string[],
): Promise<SubscriptionState> {
  const current = await registration.pushManager.getSubscription();
  if (!current) {
    return "none";
  }
  if (serverEndpoints.includes(current.endpoint)) {
    return "subscribed";
  }
  return (await saveSubscription(registration, current)) ? "subscribed" : "unregistered";
}

/**
 * Activar con el gesto de la persona: registra la suscripción que ya trae el navegador y, si la casa no
 * la acepta, la suelta y pide una nueva para registrar esa. Sin gesto no se usa: en silencio manda
 * `saveSubscription`, que no suelta una suscripción por un rechazo pasajero.
 */
export async function activateSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: BufferSource,
): Promise<boolean> {
  const current = await registration.pushManager.getSubscription();
  if (current) {
    if (await saveSubscription(registration, current)) {
      return true;
    }
    try {
      await current.unsubscribe();
    } catch {
      return false;
    }
  }
  try {
    const fresh = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
    return saveSubscription(registration, fresh);
  } catch {
    return false;
  }
}

export async function forgetSubscription(endpoint: string): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}
