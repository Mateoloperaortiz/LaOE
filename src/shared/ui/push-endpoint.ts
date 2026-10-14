// El endpoint de la suscripción push de este navegador (ADR-118 regla 17). Solo usa APIs del navegador y
// por eso vive acá: lo lee el formulario de salida, que es de `identity`, sin entrar a `comms`.

/** Cuánto espera la salida a que el navegador diga cuál es su suscripción. */
const ENDPOINT_WAIT_MS = 2000;

/**
 * Lee el endpoint de la suscripción push de este navegador, o `null` si no tiene. No la suelta: la casa
 * retira la fila de quien sale y el navegador conserva su suscripción, que es lo que deja que entrar la
 * vuelva a registrar sin gesto (decisión abierta 43). Nunca frena a quien la llama: si el navegador
 * falla o no responde a tiempo, devuelve `null`.
 */
export async function readPushEndpoint(waitMs = ENDPOINT_WAIT_MS): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const reading = (async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  })().catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const endpoint = await Promise.race([reading, timeout]);
  clearTimeout(timer);
  return endpoint;
}
