import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const pretty = !isProduction && !process.env.CI && process.stdout.isTTY;

const REDACTED = "[oculto]";

/**
 * Lo único que las rutas de abajo dejan leer: el código de un error registrado como `err` (`57P01`,
 * `ECONNRESET`), que es por lo que se busca en un incidente (ADR-118 regla 23). Cualquier otro `code`
 * sigue oculto, y si pino deja de decir de qué clave viene, este también.
 */
function censor(value: unknown, path: string[]): unknown {
  return path.length === 2 && path[0] === "err" && path[1] === "code" ? value : REDACTED;
}

/** El código de la causa más cercana que traiga uno. */
function causeCode(error: Error): string | number | undefined {
  let current: unknown = error.cause;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      return code;
    }
    current = current.cause;
  }
  return undefined;
}

type QueryError = Error & { query: string; params: unknown[] };

/** Un error de consulta de Drizzle: trae el SQL y, aparte, los valores con que se llamó. */
function isQueryError(error: unknown): error is QueryError {
  const candidate = error as Partial<QueryError> | null;
  return (
    error instanceof Error &&
    typeof candidate?.query === "string" &&
    Array.isArray(candidate.params)
  );
}

/** SQLSTATE de la clase 22, «data exception»: el mensaje de Postgres cita el valor que rechazó. */
const DATA_EXCEPTION = /^22[0-9A-Z]{3}$/;

/**
 * El mensaje de un error de conversión de Postgres sin el valor que cita («invalid input syntax for
 * type date: "…"»). Se oculta desde la primera comilla hasta la última: el valor puede traer comillas
 * y Postgres no las escapa. Cualquier otro mensaje vuelve igual, porque ahí lo que va entre comillas
 * es el nombre de una restricción o de una columna, que es lo que sirve para depurar.
 */
function withoutQuotedValue(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && DATA_EXCEPTION.test(code)
    ? error.message.replace(/"[\s\S]*"/, `"${REDACTED}"`)
    : error.message;
}

/**
 * `text` es el mensaje o la traza de `error`, con sus causas dobladas adentro. Lo devuelve sin los
 * valores de la consulta que falló, mirando el error y sus causas hasta cinco niveles: el tramo
 * `params: …` que escribe Drizzle y el valor que cita un error de conversión de Postgres. Los dos se
 * quitan por coincidencia exacta con lo que cada error escribió, no con una expresión que adivine
 * dónde termina.
 */
function withoutQueryValues(error: Error, text: string): string {
  let clean = text;
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (isQueryError(current)) {
      // Lo mismo que escribe Drizzle: `params: ${params}`.
      clean = clean.split(`\nparams: ${current.params.join(",")}`).join("");
    }
    const hidden = withoutQuotedValue(current);
    if (hidden !== current.message) {
      clean = clean.split(current.message).join(hidden);
    }
    current = current.cause;
  }
  return clean;
}

/**
 * El serializador de pino dobla la causa dentro del mensaje y de la traza, y pierde su código. Drizzle
 * envuelve cada error de Postgres en un `DrizzleQueryError`, así que sin esto el `57P01` de una
 * consulta que falló no sale en ninguna parte.
 *
 * Los valores de esa consulta no salen (ADR-118 regla 23): pueden ser un correo o una IP. Drizzle los
 * trae en `params` y los repite en su mensaje («Failed query: … params: …»), que pino copia en
 * `message` y en `stack`, también cuando el error llega como causa de otro. El SQL, con sus `$1`, se
 * queda: es lo que sirve para depurar. Tampoco sale el valor que Postgres cita en el mensaje de un
 * error de conversión (ADR-119 regla 15).
 */
function serializeError(error: unknown): unknown {
  const serialized = pino.stdSerializers.err(error as Error);
  if (!(error instanceof Error)) {
    return serialized;
  }
  if (serialized.code === undefined) {
    const code = causeCode(error);
    if (code !== undefined) {
      serialized.code = code;
    }
  }
  serialized.message = withoutQueryValues(error, serialized.message);
  serialized.stack = withoutQueryValues(error, serialized.stack);
  if (isQueryError(error)) {
    delete serialized.params;
  }
  return serialized;
}

// JSON en producción, CI y archivos; el formateador con worker queda para la terminal local.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: null,
  serializers: { err: serializeError },
  redact: {
    paths: [
      // Sueltas en la línea o en lo que fija un logger hijo, y con una clave encima: las rutas con
      // `*` no cubren el primer nivel (ADR-119 regla 14).
      "password",
      "token",
      "code",
      "secret",
      "*.password",
      "*.token",
      "*.code",
      "*.secret",
      // No oculta nada: pino solo le pasa a `censor` el nombre de la clave de primer nivel cuando esa
      // clave tiene una ruta propia, y `censor` lo necesita para dejar pasar el código de un error.
      "err.code",
      "req.headers.cookie",
      "req.headers.authorization",
    ],
    censor,
  },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});
