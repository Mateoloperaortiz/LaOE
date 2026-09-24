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
