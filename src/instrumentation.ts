import type { Instrumentation } from "next";

/**
 * El error que una action, una ruta o un render dejan escapar queda en el registro de la casa, por
 * su serializador (ADR-120 regla 12). Next lo imprime además por su cuenta, con `console.error` y
 * antes de llamar acá. La línea nombra la ruta por su patrón: nunca la dirección pedida, que puede
 * traer un token en un segmento o en la consulta, ni los encabezados, que traen la cookie.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  const { logger } = await import("@/shared/log");
  logger.error(
    { err: error, route: context.routePath, routeType: context.routeType, method: request.method },
    "error sin capturar en una ruta",
  );
};

export async function register() {
  // Solo en el runtime de Node (no en edge ni en el navegador).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { getEnv } = await import("@/env");
  const { logger } = await import("@/shared/log");
  const env = getEnv();
  logger.info(
    { env: env.NODE_ENV, timezone: env.APP_TIMEZONE, jobs: env.JOBS_ENABLED },
    "Casa digital de la OE: arranque",
  );
  if (env.JOBS_ENABLED) {
    const { startJobs } = await import("@/jobs/start");
    startJobs();
  }
}
