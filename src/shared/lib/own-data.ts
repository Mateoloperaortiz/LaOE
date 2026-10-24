// Forma del archivo de acceso del titular (ADR-143). Una fila adicional detecta un corte real.
export const OWN_DATA_ROW_LIMIT = 10_000;
export const OWN_DATA_QUERY_LIMIT = OWN_DATA_ROW_LIMIT + 1;

export interface OwnDataLimit {
  limit: number | null;
  returned: number;
  truncated: boolean;
}

/** Recibe colecciones consultadas con QUERY_LIMIT, nunca con un límite de pantalla. */
export function ownDataCollections<T extends Record<string, unknown[]>>(collections: T) {
  const data = Object.fromEntries(
    Object.entries(collections).map(([key, rows]) => [key, rows.slice(0, OWN_DATA_ROW_LIMIT)]),
  ) as T;
  const limits: Record<keyof T, OwnDataLimit> = Object.fromEntries(
    Object.entries(collections).map(([key, rows]) => [
      key,
      {
        limit: OWN_DATA_ROW_LIMIT,
        returned: Math.min(rows.length, OWN_DATA_ROW_LIMIT),
        truncated: rows.length > OWN_DATA_ROW_LIMIT,
      },
    ]),
  ) as Record<keyof T, OwnDataLimit>;
  return { data, limits };
}
