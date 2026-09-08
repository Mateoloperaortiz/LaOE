export interface AdminNavGroup {
  id: string;
  label: string;
  items: { href: string; label: string }[];
}

/** Un único destino: la ruta más específica, con frontera de segmento. */
export function activeAdminHref(pathname: string, hrefs: string[]): string | undefined {
  return hrefs
    .filter((href) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}
