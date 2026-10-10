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

/** Las cuatro claves que el registro no escribe, estén donde estén. */
const HIDDEN_KEYS = ["password", "token", "code", "secret"];

/** Una línea trae alguna de esas claves solo si trae su nombre escrito así: JSON no escapa letras. */
const NAMES_A_HIDDEN_KEY = new RegExp(`"(?:${HIDDEN_KEYS.join("|")})":`);

/** Oculta las cuatro claves en `value` y en todo lo que cuelga de él, sin tope de profundidad. */
function hideKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      hideKeys(item);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (HIDDEN_KEYS.includes(key)) {
      record[key] = REDACTED;
    } else {
      hideKeys(record[key]);
    }
  }
}

/**
 * Lo mismo dentro de un error registrado como `err`, que deja leer su código (ADR-118 regla 23) y el
 * de cada error que agrupa: pino los lista en `aggregateErrors`, y son códigos de error igual.
 */
function hideKeysInError(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    hideKeys(value);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "code") {
      continue;
    }
    const inner = record[key];
    if (key === "aggregateErrors" && Array.isArray(inner)) {
      for (const grouped of inner) {
        hideKeysInError(grouped);
      }
    } else if (HIDDEN_KEYS.includes(key)) {
      record[key] = REDACTED;
    } else {
      hideKeys(inner);
    }
  }
}

/**
 * La línea como va a salir, con las cuatro claves ocultas a cualquier profundidad (ADR-120 regla 9).
 * Las rutas de pino cubren los dos primeros niveles y no pasan de ahí: no admiten «a cualquier
 * profundidad», y con un comodín por nivel su copia de un `Buffer` anidado lanza y tumba a quien
 * registra. Este paso mira lo que pino ya escribió, así que cubre también lo que fija un logger hijo
 * y lo que un objeto escribe con su `toJSON`. Solo vuelve a leer la línea que nombra alguna de las
 * cuatro claves; las demás salen como llegaron. Una línea que no se puede revisar no se escribe.
 */
function withoutHiddenKeys(line: string): string {
  if (!NAMES_A_HIDDEN_KEY.test(line)) {
    return line;
  }
  try {
    const record = JSON.parse(line) as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === "err") {
        hideKeysInError(record[key]);
      } else if (HIDDEN_KEYS.includes(key)) {
        record[key] = REDACTED;
      } else {
        hideKeys(record[key]);
      }
    }
    return `${JSON.stringify(record)}\n`;
  } catch {
    return `${JSON.stringify({ level: 50, time: Date.now(), msg: "registro: una línea no se pudo revisar y no se escribió" })}\n`;
  }
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

/** El código de un error, o el de su causa más cercana que traiga uno. */
export function errorCode(error: Error): string | number | undefined {
  const own = (error as { code?: unknown }).code;
  return typeof own === "string" || typeof own === "number" ? own : causeCode(error);
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
 * SQLSTATE cuyo mensaje cita un valor entre comillas. La clase 22, «data exception», cita el valor
 * que rechazó. La clase 28, «invalid authorization», el 3D000, «invalid catalog name», y el 53300,
 * «too many connections», responden a una conexión que no abrió y citan con quién y a dónde iba: el
 * usuario, la base, el host. Solo entran códigos que no citan otra cosa: el 42501 y el 55000 también
 * responden a una conexión que no abrió, pero citan además una tabla o una secuencia, que es lo que
 * sirve para depurar. De esos dos se quita lo de la conexión configurada (`configuredNames`).
 */
const QUOTES_A_VALUE = /^(?:22|28)[0-9A-Z]{3}$|^3D000$|^53300$/;

/**
 * El mensaje de un error de Postgres sin el valor que cita: el de una conversión («invalid input
 * syntax for type date: "…"») o el de una conexión que no abrió («password authentication failed for
 * user "…"», «database "…" does not exist»). Se oculta desde la primera comilla hasta la última: el
 * valor puede traer comillas y Postgres no las escapa. Cualquier otro mensaje vuelve igual, porque
 * ahí lo que va entre comillas es el nombre de una restricción o de una columna, que es lo que sirve
 * para depurar.
 */
function withoutQuotedValue(error: Error): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && QUOTES_A_VALUE.test(code)
    ? error.message.replace(/"[\s\S]*"/, `"${REDACTED}"`)
    : error.message;
}

/** El código con que Node rechaza un certificado que no nombra al host al que iba la conexión. */
const CERTIFICATE_MISMATCH = "ERR_TLS_CERT_ALTNAME_INVALID";

interface ConnectionTarget {
  /** Lo que el error escribió en su mensaje, lo más largo primero. */
  written: string[];
  /** Los campos donde Node lo repite, que pino copiaría tal cual a `err`. */
  fields: string[];
}

const NO_TARGET: ConnectionTarget = { written: [], fields: [] };

/**
 * A dónde iba una conexión que no abrió, como lo escribe Node. En un error de sistema (trae
 * `syscall`): `address` y `port` en un `connect ECONNREFUSED 10.0.0.5:5432`, `hostname` en un
 * `getaddrinfo ENOTFOUND …`. En un certificado que no nombra al host: `host`, y `reason`, que es la
 * frase con el host y con los nombres que el certificado sí trae; `cert` es el certificado entero.
 * Todo eso lo repite en el mensaje, y de ahí se quita por coincidencia exacta.
 */
function connectionTarget(error: Error): ConnectionTarget {
  const { code, syscall, address, port, hostname, host, reason } = error as {
    code?: unknown;
    syscall?: unknown;
    address?: unknown;
    port?: unknown;
    hostname?: unknown;
    host?: unknown;
    reason?: unknown;
  };
  const written: string[] = [];
  if (code === CERTIFICATE_MISMATCH) {
    for (const text of [reason, host]) {
      if (typeof text === "string" && text !== "") {
        written.push(text);
      }
    }
    return { written, fields: ["host", "reason", "cert"] };
  }
  if (typeof syscall !== "string") {
    return NO_TARGET;
  }
  if (typeof address === "string" && address !== "") {
    if (typeof port === "number") {
      written.push(`${address}:${port}`);
    }
    written.push(address);
  }
  if (typeof hostname === "string" && hostname !== "") {
    written.push(hostname);
  }
  return written.length > 0 ? { written, fields: ["address", "port", "hostname"] } : NO_TARGET;
}

/** El usuario y la base de `connectionString`, entre comillas: así los cita PostgreSQL. */
function quotedNamesOf(connectionString: string | undefined): string[] {
  if (!connectionString) {
    return [];
  }
  try {
    const url = new URL(connectionString);
    return [url.username, url.pathname.slice(1)]
      .map((name) => decodeURIComponent(name))
      .filter((name) => name !== "")
      .map((name) => `"${name}"`);
  } catch {
    return [];
  }
}

let namesReadFrom: string | undefined;
let namesRead: string[] = [];

/**
 * Con quién y a qué base va la conexión configurada (`DATABASE_URL`), como PostgreSQL los cita. Se
 * quitan de todo mensaje, sin mirar su código: un fallo al conectar que los nombre no depende de que
 * el recorte reconozca el error (ADR-120 regla 10). Van con sus comillas para no tocar esa misma
 * palabra donde no es un nombre citado, como la ruta de un archivo en la traza. Lee la variable y no
 * `getEnv()`: el registro no puede fallar porque falte otra, y sin conexión configurada no hay nada
 * que quitar.
 */
function configuredNames(): string[] {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString !== namesReadFrom) {
    namesReadFrom = connectionString;
    namesRead = quotedNamesOf(connectionString);
  }
  return namesRead;
}

/**
 * `text` es el mensaje o la traza de `error`, con sus causas dobladas adentro. Lo devuelve sin los
 * valores de la consulta que falló y sin los datos de una conexión que no abrió, mirando el error y
 * sus causas hasta cinco niveles: el tramo `params: …` que escribe Drizzle, el valor que cita un
 * error de Postgres (el de una conversión, o el usuario y la base de una conexión rechazada), el
 * destino que Node escribe en un error de red o en un certificado que no nombra al host, y el usuario
 * y la base de la conexión configurada donde PostgreSQL los cite (ADR-120 regla 10). Todo se quita
 * por coincidencia exacta con lo que cada error escribió, no con una expresión que adivine dónde
 * termina.
 *
 * Es el recorte del serializador de `err`, y lo usa también quien guarda el texto de un error fuera
 * del registro: el poller, en `outbox.last_error` (ADR-119 regla 16).
 */
export function withoutQueryValues(error: Error, text: string): string {
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
    for (const target of connectionTarget(current).written) {
      clean = clean.split(target).join(REDACTED);
    }
    current = current.cause;
  }
  for (const quoted of configuredNames()) {
    clean = clean.split(quoted).join(`"${REDACTED}"`);
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
 * error de conversión (ADR-119 regla 15), ni a dónde iba ni con quién una conexión que no abrió
 * (ADR-120 regla 10): pino copia `address`, `port` y `hostname` del error como campos, o `host`,
 * `reason` y `cert` si el certificado no nombra al host, y lista aparte cada intento de una conexión
 * que probó varias direcciones.
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
  for (const field of connectionTarget(error).fields) {
    delete serialized[field];
  }
  const grouped = (error as { errors?: unknown }).errors;
  if (Array.isArray(grouped) && Array.isArray(serialized.aggregateErrors)) {
    serialized.aggregateErrors = grouped.map(serializeError);
  }
  return serialized;
}

/**
 * Una copia de `error` que se puede imprimir fuera del registro: su nombre, y su mensaje y su traza
 * como los deja el serializador, con las causas dobladas adentro y sin valores, más su código o el
 * de su causa. No lleva nada de lo que el error trae colgado: ni `params`, ni la causa con su
 * `detail` (ADR-120 regla 12).
 */
export function printableError(error: Error): Error {
  const serialized = serializeError(error) as { message: string; stack: string; code?: unknown };
  const copy = new Error(serialized.message);
  copy.name = error.name;
  copy.stack = serialized.stack;
  if (serialized.code !== undefined) {
    Object.assign(copy, { code: serialized.code });
  }
  return copy;
}

// JSON en producción, CI y archivos; el formateador con worker queda para la terminal local.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: null,
  serializers: { err: serializeError },
  // Lo que las rutas de abajo no alcanzan, más abajo del segundo nivel (ADR-120 regla 9).
  hooks: { streamWrite: withoutHiddenKeys },
  redact: {
    paths: [
      // Sueltas en la línea o en lo que fija un logger hijo, y con una clave encima: las rutas con
      // `*` no cubren el primer nivel (ADR-119 regla 14).
      ...HIDDEN_KEYS,
      ...HIDDEN_KEYS.map((key) => `*.${key}`),
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
