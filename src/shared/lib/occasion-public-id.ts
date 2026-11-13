// La forma del identificador público de una ocasión (ADR-035 regla 3), sin nada de servidor: la usan
// el dominio de participación y el lector de «Asistencia» en el navegador (ADR-160 regla 4), que como
// componente no puede importar del dominio. La validación acepta cualquier
// [0-9a-z] de diez para que los publicId heredados de GHPOINTS sigan resolviendo tal cual.

export const PUBLIC_ID = /^[0-9a-z]{10}$/;

export function isPublicId(value: string): boolean {
  return PUBLIC_ID.test(value);
}

/**
 * El camino de registro que trae el QR de una ocasión (`…/a/<id público>`), o `null` si el QR no es
 * de una ocasión. Solo se queda con el camino: el registro se abre en la casa donde se leyó, nunca en
 * el dominio que diga el QR.
 */
export function checkInPathFrom(value: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim(), origin);
  } catch {
    return null;
  }
  const id = /^\/a\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  return id && isPublicId(id) ? `/a/${id}` : null;
}
