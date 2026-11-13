/** El icono de cada espacio de la Operación (ADR-159 regla 2); el cliente lo traduce a su glifo. */
export type AdminSpaceIcon =
  | "personas"
  | "comites"
  | "admision"
  | "comunicacion"
  | "participacion"
  | "permanencia"
  | "finanzas"
  | "macroeventos"
  | "junta"
  | "sistema";

export interface AdminNavGroup {
  id: string;
  label: string;
  icon?: AdminSpaceIcon;
  items: { href: string; label: string }[];
}

/** Un único destino: la ruta más específica, con frontera de segmento. */
export function activeAdminHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}
