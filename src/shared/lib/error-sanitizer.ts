import pino from "pino";

/**
 * El saneo de errores: lo que se le quita a un error antes de escribirlo, en el registro o fuera de
 * él (ADR-129 regla 8). Acá viven el código de un error y el de su causa, el error de consulta, el
 * destino de una conexión que no abrió con la marca de quien la abre, los nombres de la conexión
 * configurada, el recorte del mensaje y de la traza, el serializador de `err` y la copia imprimible.
 *
 * No conoce el registro ni la casa: `src/shared/log.ts` lo importa, nunca al revés. De pino toma solo
 * su serializador de errores, que es la copia que acá se recorta.
 */

/** Lo que sale en lugar de lo que no se escribe: un valor, un destino, lo que no se deja leer. */
export const REDACTED = "[oculto]";

/**
 * `value` como texto. Es como el registro escribe un mensaje o una traza que no lo son (ADR-128
 * regla 2): lo que dice `String(value)`, y vacío si no hay nada, que es como un `Error` se escribe a
 * sí mismo sin mensaje. Lo que no se deja convertir (un `toString` que lanza, un objeto sin prototipo)
 * no se escribe: sale `[oculto]`. No lanza.
 */
export function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  try {
    return String(value);
  } catch {
    return REDACTED;
  }
}

/** El mensaje o la traza de `error`, como texto. Si leerlo lanza (un getter, un `Proxy`), `[oculto]`. */
export function textOf(error: object, field: "message" | "stack"): string {
  try {
    return asText((error as Record<string, unknown>)[field]);
  } catch {
    return REDACTED;
  }
}

/**
 * El código de un error es un texto o un número (`57P01`, `ECONNRESET`, `-61`). Otra cosa bajo esa
 * clave no es un código, y lo que cuelgue de ella no se deja leer (ADR-120 regla 9).
 */
export function isErrorCode(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Lo que el registro recorta como un error: un `Error`, o lo que pino serializa como si lo fuera, un
 * objeto con un texto por `message` (ADR-128 regla 3). Así llega un error de otro contexto de
 * ejecución, donde `instanceof Error` no vale. Vale donde alguien dijo que eso es un error: bajo `err`,
 * como causa de otro y en lo que cuelga de un error registrado (ADR-129 regla 5). En cualquier otra
 * parte un objeto con `message` es un dato.
 */
export function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { message?: unknown }).message === "string")
  );
}

/** El código de la causa más cercana que traiga uno. */
function causeCode(error: Error): string | number | undefined {
  let current: unknown = error.cause;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (isErrorCode(code)) {
      return code;
    }
    current = current.cause;
  }
  return undefined;
}

/**
 * El código de un error, o el de su causa más cercana que traiga uno. No lanza (ADR-129 regla 6): del
 * error que no se deja leer (un `Proxy`, un `code` que lanza al leerlo) no hay código que dar.
 */
export function errorCode(error: Error): string | number | undefined {
  try {
    const own = (error as { code?: unknown }).code;
    return isErrorCode(own) ? own : causeCode(error);
  } catch {
    return undefined;
  }
}

/**
 * La causa de `error` que pino dobla en su mensaje y en su traza: lo que cuelga de `cause` o, si es
 * una función, lo que devuelve, al modo de VError (ADR-129 regla 5). Pino la llama igual.
 */
function foldedCause(error: Error): unknown {
  const cause: unknown = error.cause;
  return typeof cause === "function" ? (cause.call(error) as unknown) : cause;
}

type QueryError = Error & { query: string; params: unknown[] };

/**
 * Un error de consulta de Drizzle: trae el SQL y, aparte, los valores con que se llamó. También lo
 * que tiene esa forma sin ser un `Error` (`isErrorLike`).
 */
function isQueryError(error: unknown): error is QueryError {
  const candidate = error as Partial<QueryError> | null;
  return (
    isErrorLike(error) && typeof candidate?.query === "string" && Array.isArray(candidate.params)
  );
}

/**
 * Si el error, o alguna de sus causas hasta cinco niveles, es un error de consulta. Recorre solo lo
 * que es un `Error`: lo que tiene su forma sin serlo se recorta al escribirlo, y acá no cuenta.
 *
 * No lanza (ADR-129 regla 6): el error que no se deja leer tampoco cuenta. De él no se puede decir que
 * sea de una consulta, y quien pregunta registra solo esos.
 */
export function carriesQueryError(error: unknown): boolean {
  try {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
      if (isQueryError(current)) {
        return true;
      }
      current = current.cause;
    }
    return false;
  } catch {
    return false;
  }
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
 * `message`, el mensaje de un error de Postgres ya como texto, sin el valor que cita: el de una conversión («invalid input
 * syntax for type date: "…"») o el de una conexión que no abrió («password authentication failed for
 * user "…"», «database "…" does not exist»). Se oculta desde la primera comilla hasta la última: el
 * valor puede traer comillas y Postgres no las escapa. Cualquier otro mensaje vuelve igual, porque
 * ahí lo que va entre comillas es el nombre de una restricción o de una columna, que es lo que sirve
 * para depurar.
 */
function withoutQuotedValue(error: Error, message: string): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && QUOTES_A_VALUE.test(code)
    ? message.replace(/"[\s\S]*"/, `"${REDACTED}"`)
    : message;
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

/** Un código de error de Node (`ECONNRESET`, `ERR_SOCKET_…`), no un SQLSTATE ni el de un proveedor. */
const NODE_CODE = /^E[A-Z0-9_]+$/;

/** El host, con su puerto y solo: lo más largo primero. */
function hostTexts(host: unknown, port: unknown): string[] {
  if (typeof host !== "string" || host === "") {
    return [];
  }
  const hasPort = typeof port === "number" || (typeof port === "string" && port !== "");
  return hasPort ? [`${host}:${port}`, host] : [host];
}

/** A dónde iba cada fallo al conectar que marcó quien abre las conexiones. */
const failedConnections = new WeakMap<Error, string[]>();

/**
 * Marca `error` como un fallo al conectar con `connectionString` (ADR-123 regla 16). De un error
 * marcado el registro quita ese host, con su puerto y solo, vaya o no entre comillas en el mensaje, y
 * los campos donde un error de red repite su destino. El host es el de la parte de autoridad de la
 * conexión, tal cual: por parámetro, IPv6 entre corchetes o con otras mayúsculas no se reconoce
 * (DT-307). La marca la pone quien abre la conexión
 * (`src/db/client.ts`): solo ahí se sabe que el error es de una conexión y a dónde iba. Sin ella un
 * host corto (`db`, `localhost`) no se puede quitar por texto: se borraría de mensajes que no son de
 * una conexión. Una conexión que no se deja leer marca igual, sin texto que quitar.
 */
export function markConnectionFailure(error: unknown, connectionString: string): void {
  if (!(error instanceof Error)) {
    return;
  }
  try {
    const url = new URL(connectionString);
    failedConnections.set(error, hostTexts(decodeURIComponent(url.hostname), url.port));
  } catch {
    failedConnections.set(error, []);
  }
}

/** Los campos donde un error de red repite a dónde iba, de cualquiera de las formas de abajo. */
const TARGET_FIELDS = ["address", "port", "hostname", "host", "path", "localAddress"];

/**
 * A dónde iba una conexión que no abrió: lo que el error deja ver por su forma y, si quien abre la
 * conexión lo marcó, el host configurado.
 */
function connectionTarget(error: Error): ConnectionTarget {
  const shaped = targetByShape(error);
  const configured = failedConnections.get(error);
  return configured
    ? { written: [...shaped.written, ...configured], fields: TARGET_FIELDS }
    : shaped;
}

/**
 * A dónde iba una conexión que no abrió, como lo escribe Node. En un error de sistema (trae
 * `syscall`): `address` y `port` en un `connect ECONNREFUSED 10.0.0.5:5432`, `hostname` en un
 * `getaddrinfo ENOTFOUND …`. En un certificado que no nombra al host: `host`, y `reason`, que es la
 * frase con el host y con los nombres que el certificado sí trae; `cert` es el certificado entero.
 * Todo eso lo repite en el mensaje, y de ahí se quita por coincidencia exacta. En un error de socket
 * sin `syscall`, como la conexión TLS que se cae antes del saludo: `host`, `port`, `path` y
 * `localAddress`, que Node deja como campos y no escribe en el mensaje (ADR-123 regla 16).
 */
function targetByShape(error: Error): ConnectionTarget {
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
    const isSocketError =
      typeof code === "string" && NODE_CODE.test(code) && typeof host === "string" && host !== "";
    return isSocketError
      ? { written: hostTexts(host, port), fields: ["host", "port", "path", "localAddress"] }
      : NO_TARGET;
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
 * Cuántos errores mira el recorte en una cadena de causas, contando el primero (ADR-129 regla 5). Una
 * cadena de verdad tiene dos o tres; el tope está para la que no se acaba.
 */
const CAUSE_CHAIN_LIMIT = 100;

/** Un renglón `at …` de la traza: lo que trae es la ruta de un archivo, no un mensaje. */
const STACK_FRAME = /^\s+at .*(?::\d+:\d+\)?|\(<anonymous>\)|\(native\))$/;

/**
 * `text` con `written` cambiado por `replacement` donde aparezca, salvo en los renglones `at …` de la
 * traza (ADR-123 regla 16): un host corto (`db`, `unit`) es también el nombre de una carpeta, y de
 * la ruta de un archivo no hay nada que ocultar.
 */
function replaceOutsideStackFrames(text: string, written: string, replacement: string): string {
  if (!text.includes(written)) {
    return text;
  }
  const lines = text.split("\n");
  const out: string[] = [];
  let message: string[] = [];
  const flush = () => {
    if (message.length > 0) {
      out.push(message.join("\n").split(written).join(replacement));
      message = [];
    }
  };
  for (const line of lines) {
    if (STACK_FRAME.test(line)) {
      flush();
      out.push(line);
    } else {
      message.push(line);
    }
  }
  flush();
  return out.join("\n");
}

/**
 * `text` es el mensaje o la traza de `error`, con sus causas dobladas adentro. Lo devuelve sin los
 * valores de la consulta que falló y sin los datos de una conexión que no abrió, mirando el error y
 * cada causa que pino dobló ahí, hasta cien errores (ADR-129 regla 5): el tramo `params: …` que
 * escribe Drizzle, el valor que cita un
 * error de Postgres (el de una conversión, o el usuario y la base de una conexión rechazada), el
 * destino que Node escribe en un error de red o en un certificado que no nombra al host, y el usuario
 * y la base de la conexión configurada donde PostgreSQL los cite (ADR-120 regla 10). Todo se quita
 * por coincidencia exacta con lo que cada error escribió, no con una expresión que adivine dónde
 * termina. Un destino y un nombre citado se quitan del mensaje, no de los renglones `at …` de la
 * traza (ADR-123 regla 16).
 *
 * Es el recorte del serializador de `err`, y lo usa también quien guarda el texto de un error fuera
 * del registro: el poller, en `outbox.last_error` (ADR-119 regla 16).
 *
 * Recorre también lo que tiene forma de error sin serlo (`isErrorLike`, ADR-128 regla 3): pino dobla
 * en el mensaje y en la traza la causa que tiene un texto por `message`, sea o no un `Error`, y la que
 * devuelve una causa que es una función (`foldedCause`). Para donde para pino, en la causa que no
 * tiene forma de error o en la que ya recorrió, y además en su tope (`CAUSE_CHAIN_LIMIT`): lo que ya
 * recorrió corta un ciclo, no una cadena que arma una causa nueva cada vez que la leen.
 *
 * No lanza (ADR-128 regla 2). `text` y el mensaje de cada error se leen como texto (`asText`), sean lo
 * que sean. Y si el error no se deja leer, sus valores no se dejan escribir o la cadena de causas pasa
 * del tope, no hay con qué recortar y el texto no sale: devuelve `[oculto]`.
 */
export function withoutQueryValues(error: Error, text: string): string {
  try {
    let clean = asText(text);
    const walked = new Set<unknown>();
    let current: unknown = error;
    // El tope cuenta las vueltas y no lo ya recorrido: no depende de que el corte del ciclo esté.
    for (let looked = 0; isErrorLike(current) && !walked.has(current); looked += 1) {
      if (looked >= CAUSE_CHAIN_LIMIT) {
        // La cadena sigue: lo que pino dobló de ahí en adelante no hay con qué recortarlo.
        return REDACTED;
      }
      walked.add(current);
      if (isQueryError(current)) {
        // Lo mismo que escribe Drizzle: `params: ${params}`.
        clean = clean.split(`\nparams: ${current.params.join(",")}`).join("");
      }
      const message = textOf(current, "message");
      const hidden = withoutQuotedValue(current, message);
      if (hidden !== message) {
        clean = clean.split(message).join(hidden);
      }
      for (const target of connectionTarget(current).written) {
        clean = replaceOutsideStackFrames(clean, target, REDACTED);
      }
      current = foldedCause(current);
    }
    for (const quoted of configuredNames()) {
      clean = replaceOutsideStackFrames(clean, quoted, `"${REDACTED}"`);
    }
    return clean;
  } catch {
    return REDACTED;
  }
}

/**
 * `error` como lo serializa pino: su tipo, su mensaje y su traza con las causas dobladas adentro, y
 * sus campos. Para pino un error cuyo `message` no es un texto no tiene forma de error y lo devuelve
 * tal cual, sin copiarlo; y con uno congelado, o con uno cuyo `message` lanza al leerlo, lanza él. En
 * los tres casos serializa una vista del error: un objeto que hereda todo de él y fija su mensaje y su
 * traza como textos (ADR-128 regla 2). Así lo que se recorta después es siempre la copia de pino,
 * nunca el error que le pasaron al registro.
 */
function serializedByPino(error: Error): ReturnType<typeof pino.stdSerializers.err> {
  try {
    const serialized = pino.stdSerializers.err(error);
    if ((serialized as unknown) !== error) {
      return serialized;
    }
  } catch {
    // Pino no pudo con el error tal cual: sigue con la vista.
  }
  return pino.stdSerializers.err(
    Object.create(error, {
      message: { value: textOf(error, "message") },
      stack: { value: textOf(error, "stack") },
    }) as Error,
  );
}

/** Cuántos niveles mira el recorte en lo que cuelga de un error, contándolo a él. */
const HANGING_DEPTH = 5;

/**
 * Lo que el serializador de pino escribe en su copia y no es un campo del error. `aggregateErrors`
 * también lo escribe él, pero solo si el error trae una lista `errors`: sin ella es un campo del error
 * como cualquier otro.
 */
const WRITTEN_BY_PINO = ["type", "message", "stack"];

/** Lo que escribe en lugar de un ciclo el serializador de pino que no lanza con ellos. */
const CIRCULAR = "[Circular]";

/**
 * `value`, que cuelga de un error registrado, con cada cosa con forma de error recortada como un error
 * (ADR-129 regla 5): en un campo del error, en una lista o en un objeto, hasta `HANGING_DEPTH` niveles
 * contando el error. `above` es el camino desde ese error. Lo que le pasaron al registro no se toca:
 * de la lista o del objeto que trae un error sale una copia, y lo que no trae ninguno vuelve tal cual,
 * así que se escribe como se escribía. No entra a lo que se escribe a sí mismo con `toJSON` (una
 * fecha, un `Buffer`). El error que ya se está escribiendo más arriba no se escribe otra vez.
 */
function trimmedHanging(value: unknown, above: readonly object[]): unknown {
  if (typeof value !== "object" || value === null || above.length >= HANGING_DEPTH) {
    return value;
  }
  if (above.includes(value)) {
    return isErrorLike(value) ? CIRCULAR : value;
  }
  if (isErrorLike(value)) {
    return trimmedError(value, above);
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return value;
  }
  const path = [...above, value];
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => trimmedHanging(item, path));
    return items.some((item, index) => item !== value[index]) ? items : value;
  }
  let copy: Record<string, unknown> | undefined;
  for (const key of Object.keys(value)) {
    const inner = (value as Record<string, unknown>)[key];
    const trimmed = trimmedHanging(inner, path);
    if (trimmed !== inner) {
      copy ??= { ...value };
      copy[key] = trimmed;
    }
  }
  return copy ?? value;
}

/**
 * Un elemento con forma de error de la lista `errors`, recortado como un error. `listed` es el camino
 * hasta esa lista: el error que ya se está escribiendo más arriba no se escribe otra vez, como en
 * cualquier lista que cuelga del error (ADR-129 regla 5). Sin ese camino, el agregado al que nombra
 * uno de sus errores se recorría sin fin. El que no se deja leer sale `[oculto]`, él solo.
 */
function trimmedListed(inner: Error, listed: readonly object[]): unknown {
  if (listed.includes(inner)) {
    return CIRCULAR;
  }
  try {
    return trimmedError(inner, listed);
  } catch {
    return REDACTED;
  }
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
 *
 * Lo que cuelga del error se recorta igual (ADR-129 regla 5, `trimmedHanging`): pino serializa como
 * un error el campo que tiene forma de error, sin recortarlo, y copia tal cual la lista y el objeto
 * que traen uno. `above` es el camino desde el error de la línea, vacío si es él.
 *
 * Lanza si el error no se deja leer: de eso se ocupa `serializeError`.
 */
function trimmedError(error: unknown, above: readonly object[] = []): unknown {
  // Lo que no tiene forma de error sale como llegó: pino lo devuelve tal cual.
  if (!isErrorLike(error)) {
    return pino.stdSerializers.err(error as Error);
  }
  const serialized = serializedByPino(error);
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
  const path = [...above, error];
  const grouped = (error as { errors?: unknown }).errors;
  const listedByPino = Array.isArray(grouped) && Array.isArray(serialized.aggregateErrors);
  if (listedByPino) {
    // Lo que en la lista no tiene forma de error pino lo deja tal cual: ahí se busca adentro, como
    // en cualquier lista que cuelga del error.
    const listed = [...path, grouped];
    serialized.aggregateErrors = grouped.map((inner: unknown) =>
      isErrorLike(inner) ? trimmedListed(inner, listed) : trimmedHanging(inner, listed),
    );
    // Pino lista los errores de `errors` en `aggregateErrors`, sea o no un `AggregateError`. Si esa
    // lista además se enumera, la copia cruda al lado: sale una vez, recortada.
    delete serialized.errors;
  }
  for (const key of Object.keys(serialized)) {
    if (WRITTEN_BY_PINO.includes(key) || (listedByPino && key === "aggregateErrors")) {
      continue;
    }
    const hanging = (error as unknown as Record<string, unknown>)[key];
    if (isErrorLike(hanging) && path.includes(hanging)) {
      // Dos errores que se nombran uno al otro: pino no repite el que ya está escribiendo.
      delete serialized[key];
      continue;
    }
    const trimmed = trimmedHanging(hanging, path);
    if (trimmed !== hanging) {
      serialized[key] = trimmed;
    }
  }
  return serialized;
}

/**
 * El serializador de `err`. No lanza (ADR-128 regla 2): lo que no se deja leer (un `Proxy`, un campo
 * que lanza al leerlo) no se escribe, sale `[oculto]`, y la línea conserva su mensaje y lo demás.
 */
export function serializeError(error: unknown): unknown {
  try {
    return trimmedError(error);
  } catch {
    return REDACTED;
  }
}

/**
 * Una copia de `error` que se puede imprimir fuera del registro: su nombre, y su mensaje y su traza
 * como los deja el serializador, con las causas dobladas adentro y sin valores, más su código o el
 * de su causa. No lleva nada de lo que el error trae colgado: ni `params`, ni la causa con su
 * `detail` (ADR-120 regla 12). Del error que no se deja leer queda una copia que solo dice `[oculto]`
 * (ADR-128 regla 2).
 */
export function printableError(error: Error): Error {
  try {
    const serialized = trimmedError(error) as { message: string; stack: string; code?: unknown };
    const copy = new Error(serialized.message);
    copy.name = error.name;
    copy.stack = serialized.stack;
    if (serialized.code !== undefined) {
      Object.assign(copy, { code: serialized.code });
    }
    return copy;
  } catch {
    return new Error(REDACTED);
  }
}
