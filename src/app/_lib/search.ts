import { internalPath } from "@/shared/lib/internal-path";

// Parámetros de búsqueda y rutas de vuelta de páginas y server actions (ADR-082).

/** Un `searchParam` puede llegar repetido: vale el primero, y ausente es `""`. */
export function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Ruta interna con parámetros agregados o reemplazados; conserva los que `base` ya traía. */
export function withQuery(base: string, extra: Record<string, string>): string {
  const url = new URL(base, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

const SAFE_PATH = /^\/[A-Za-z0-9\-._~/[\]?=&%+]*$/;

/**
 * Destino de vuelta que llega del formulario: solo una ruta propia y dentro de `within`. Cualquier otra
 * cosa (otro origen, `//host`, otra área, un `..` que sale de ella) cae en `fallback`. La ruta la
 * decide `internalPath` (ADR-114, regla 1); los caracteres seguros y el `//` son de ADR-082.
 */
export function safeBack(value: string | undefined, within: string, fallback: string): string {
  if (!value || !SAFE_PATH.test(value) || value.includes("//")) {
    return fallback;
  }
  return internalPath(value, { within, outside: [] }) ?? fallback;
}
