export async function register() {
  // Solo en el runtime de Node (no en edge ni en el navegador).
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { getEnv } = await import("@/env");
  const { logger } = await import("@/shared/log");
  const env = getEnv();
  logger.info(
    { entorno: env.NODE_ENV, zonaHoraria: env.APP_TIMEZONE, jobs: env.JOBS_ENABLED },
    "Casa digital de la OE: arranque",
  );
}
