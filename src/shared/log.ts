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

/**
 * El serializador de pino dobla la causa dentro del mensaje y de la traza, y pierde su código. Drizzle
 * envuelve cada error de Postgres en un `DrizzleQueryError`, así que sin esto el `57P01` de una
 * consulta que falló no sale en ninguna parte.
 *
 * Los valores de esa consulta no salen (ADR-118 regla 23): pueden ser un correo o una IP. Drizzle los
 * trae en `params` y los repite en su mensaje («Failed query: … params: …»), que pino copia en
 * `message` y en `stack`, también cuando el error llega como causa de otro. El SQL, con sus `$1`, se
 * queda: es lo que sirve para depurar.
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
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (isQueryError(current)) {
      // Lo mismo que escribe Drizzle: `params: ${params}`.
      const written = `\nparams: ${current.params.join(",")}`;
      serialized.message = serialized.message.split(written).join("");
      serialized.stack = serialized.stack.split(written).join("");
    }
    current = current.cause;
  }
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
