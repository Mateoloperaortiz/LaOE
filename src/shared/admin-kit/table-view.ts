// La vista de una tabla del kit en la dirección (ADR-167 regla 4): búsqueda, filtros y columnas
// visibles viajan como parámetros, así que se comparten con el enlace y una vista guardada los puede
// llevar. Lógica pura, para el servidor y el navegador.

/** Parámetro de las columnas visibles: `columnas=a,b`. Sin él se ven todas. */
export const COLUMNS_PARAM = "columnas";

/** Una dirección con sus parámetros, sin los vacíos. */
export function buildHref(basePath: string, params: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return query.size ? `${basePath}?${query}` : basePath;
}

/**
 * Las columnas visibles, en el orden de la tabla. Acepta `a,b` y también el parámetro repetido que
 * manda un formulario GET. Devuelve `null` cuando se ven todas: sin parámetro, con todas marcadas o con
 * ninguna válida, porque una tabla siempre muestra al menos una columna.
 */
export function visibleColumnKeys(
  raw: string | string[] | undefined,
  keys: readonly string[],
): string[] | null {
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((item) => item.split(","));
  const wanted = new Set(values.map((item) => item.trim()).filter(Boolean));
  const visible = keys.filter((key) => wanted.has(key));
  return visible.length === 0 || visible.length === keys.length ? null : visible;
}
