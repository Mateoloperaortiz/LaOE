import { logger } from "@/shared/log";

/**
 * Deja en el registro de la casa la excepción que una ruta pública de The Games convierte en 503 «no
 * disponible» (ADR-118 regla 24). La respuesta sale bien formada, así que Next no registra nada: sin
 * esta línea un incidente durante el evento no deja causa ni traza. Solo lleva la ruta y el error:
 * nunca el cuerpo del pedido, que en la entrada al hub trae el código del equipo, ni la cookie.
 */
export function logUnavailable(route: string, error: unknown): void {
  logger.error({ err: error, route }, "API pública no disponible");
}
