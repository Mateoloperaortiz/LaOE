// CORS de la API pública v1 (ADR-090 regla 4): solo lectura (GET y OPTIONS), sin credenciales.
// Con un solo origen permitido, el encabezado es fijo: Cloudflare cachea sin respetar `Vary: Origin`.
// Con varios (staging y local), se devuelve el que coincida y se agrega `Vary: Origin`.

export function corsHeaders(
  allowed: readonly string[],
  requestOrigin: string | null,
): Record<string, string> {
  const base = {
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-max-age": "86400",
  };
  const [only] = allowed;
  if (allowed.length === 1 && only) {
    return { ...base, "access-control-allow-origin": only };
  }
  const origin = requestOrigin?.toLowerCase() ?? null;
  if (origin && allowed.includes(origin)) {
    return { ...base, "access-control-allow-origin": origin, vary: "Origin" };
  }
  return allowed.length > 1 ? { vary: "Origin" } : {};
}

/** CORS con credenciales del hub de capitanes (ADR-096): solo el origen exacto permitido, nunca fijo,
 *  y siempre `Vary: Origin`. Sin origen permitido no hay encabezados de CORS y el navegador bloquea. */
export function credentialedCorsHeaders(
  allowed: readonly string[],
  requestOrigin: string | null,
  methods: string,
): Record<string, string> {
  const origin = requestOrigin?.toLowerCase() ?? null;
  if (!origin || !allowed.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": methods,
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}
