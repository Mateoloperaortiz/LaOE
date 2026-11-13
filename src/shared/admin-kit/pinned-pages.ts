// Favoritos y Recientes de la barra lateral (ADR-167 regla 3): la lógica pura, para probarla sin
// navegador. Son una comodidad de cada persona en su navegador (`localStorage`), como recoger la barra:
// no viajan a la casa ni a otro equipo. Las vistas guardadas, que sí se comparten, van en la base.

export type PinnedPage = { href: string; label: string };

export const FAVORITES_KEY = "oe.operacion.favoritos";
export const RECENTS_KEY = "oe.operacion.recientes";
export const MAX_FAVORITES = 8;
export const MAX_RECENTS = 5;

/** Parámetros de una pantalla que dicen qué se está haciendo, no qué se mira: no entran a la dirección. */
const TRANSIENT = ["editar", "nuevo", "guardado", "error", "pagina", "accion"];

/** La dirección que se guarda: la ruta con sus filtros, sin el registro abierto ni la página. */
export function pinnableHref(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of TRANSIENT) params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** El nombre de una pantalla a partir del título del documento: lo que va antes del primer « · ». */
export function labelFromTitle(title: string): string {
  return title.split(" · ")[0]?.trim() || title.trim();
}

/** Lee una lista guardada; lo que no tenga la forma esperada se descarta. */
export function parsePinned(raw: string | null): PinnedPage[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is PinnedPage =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PinnedPage).href === "string" &&
        (item as PinnedPage).href.startsWith("/admin") &&
        typeof (item as PinnedPage).label === "string",
    );
  } catch {
    return [];
  }
}

/** Fija o suelta una pantalla. Fijar la pone primera; la lista no pasa de `MAX_FAVORITES`. */
export function toggleFavorite(list: PinnedPage[], page: PinnedPage): PinnedPage[] {
  if (list.some((item) => item.href === page.href)) {
    return list.filter((item) => item.href !== page.href);
  }
  return [page, ...list].slice(0, MAX_FAVORITES);
}

/** Suma una visita a los recientes: primera, sin repetir y sin pasar de `MAX_RECENTS`. */
export function addRecent(list: PinnedPage[], page: PinnedPage): PinnedPage[] {
  return [page, ...list.filter((item) => item.href !== page.href)].slice(0, MAX_RECENTS);
}
