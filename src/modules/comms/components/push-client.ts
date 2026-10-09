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

export async function forgetSubscription(endpoint: string): Promise<void> {
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/** Cuánto espera la salida a que el navegador suelte su suscripción. */
const RELEASE_WAIT_MS = 2000;

/**
 * Al cerrar sesión (ADR-118 regla 17): suelta la suscripción push de este navegador y devuelve su
 * endpoint, para que la casa retire ese dispositivo de quien sale. Nunca frena la salida: si el
 * navegador falla o no responde a tiempo, devuelve lo que alcanzó a saber.
 */
export async function releaseBrowserSubscription(waitMs = RELEASE_WAIT_MS): Promise<string | null> {
  if (!isPushSupported()) {
    return null;
  }
  const found: { endpoint: string | null } = { endpoint: null };
  const release = (async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    found.endpoint = subscription.endpoint;
    await subscription.unsubscribe();
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([release, timeout]);
  clearTimeout(timer);
  return found.endpoint;
}
