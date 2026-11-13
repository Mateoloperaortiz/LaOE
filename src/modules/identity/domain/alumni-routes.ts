// Las rutas de un egresado (ADR-184 regla 4): su red, sus oportunidades, sus ahijados, su trayectoria,
// sus avisos y sus ajustes. Lo demás de Mi OE es de quien participa y lo lleva a la de egresados.

export const ALUMNI_HOME = "/app/egresados";

const ALUMNI_ROUTES = [
  "/app/egresados",
  "/app/oportunidades",
  "/app/padrinos",
  "/app/yo/trayectoria",
  "/app/avisos",
  "/app/ajustes",
] as const;

/** Si un egresado puede abrir la ruta: la misma o una más honda, sin contar la consulta. */
export function alumniMayOpen(path: string): boolean {
  const pathname = path.split(/[?#]/)[0] ?? path;
  return ALUMNI_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
