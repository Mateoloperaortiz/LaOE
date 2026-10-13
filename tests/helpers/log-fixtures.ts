import { logger } from "@/shared/log";

// Lo que comparten las pruebas del registro que miran por dónde sale el valor de una consulta
// (DT-400, ADR-129 regla 12). Lo que captura las líneas y lee su `err` vive en `./logs`.

/** El valor de una consulta: lo que no debe llegar al registro. */
export const VALUE = "miembro-481516@example.test";
/** La consulta que lo lleva. */
export const QUERY = "select id from person where email = $1";

/** Un error de consulta como lo lanza Drizzle: con el valor en el mensaje y en `params`. */
export const queryError = () =>
  Object.assign(new Error(`Failed query: ${QUERY}\nparams: ${VALUE}`), {
    query: QUERY,
    params: [VALUE],
  });

/** `logger.error` y `logger.info` sin los tipos de pino, que no admiten cualquier cosa por línea. */
export const untyped = {
  error: logger.error.bind(logger) as (...args: unknown[]) => void,
  info: logger.info.bind(logger) as (...args: unknown[]) => void,
};
