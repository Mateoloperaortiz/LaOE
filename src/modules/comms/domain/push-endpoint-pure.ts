// Servicios de push conocidos (ADR-113 regla 6). Es la única lista de a qué hosts se les guarda una
// suscripción: la casa le hace un POST al endpoint guardado en cada envío, así que no puede ser un
// destino cualquiera. Para sumar un servicio se agrega su fila.

/** `host` exacto, o `*.dominio` para cualquier subdominio de ese dominio. */
export const PUSH_SERVICES = [
  { name: "FCM (Chrome y los navegadores sobre Chromium)", host: "fcm.googleapis.com" },
  { name: "Mozilla (Firefox)", host: "updates.push.services.mozilla.com" },
  { name: "Apple (Safari)", host: "web.push.apple.com" },
  { name: "WNS (Edge en Windows)", host: "*.notify.windows.com" },
] as const;

/** Dispositivos con notificaciones que puede tener una persona; el texto del tope es T-3209. */
export const MAX_DEVICES_PER_PERSON = 10;

const SUBDOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/;

function matchesHost(hostname: string, pattern: string): boolean {
  if (!pattern.startsWith("*.")) {
    return hostname === pattern;
  }
  const suffix = pattern.slice(1);
  return hostname.endsWith(suffix) && SUBDOMAIN.test(hostname.slice(0, -suffix.length));
}

/**
 * Si el endpoint es `https`, sin credenciales ni puerto, de un servicio de la lista y está escrito en su
 * forma canónica. Lo último evita que el envío lea otro host que el que se comprobó: `web-push` arma la
 * conexión con `url.parse`, un analizador distinto del de `URL`, y los dos solo coinciden seguro sobre
 * una dirección que no hubo que normalizar. Lo que no se reconoce no es conocido.
 */
export function isKnownPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string") {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.href !== endpoint || url.protocol !== "https:") {
    return false;
  }
  if (url.username !== "" || url.password !== "" || url.port !== "") {
    return false;
  }
  return PUSH_SERVICES.some((service) => matchesHost(url.hostname, service.host));
}
