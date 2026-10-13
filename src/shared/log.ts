import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const pretty = !isProduction && !process.env.CI && process.stdout.isTTY;

const REDACTED = "[oculto]";

/** Lo que sale en lugar de una línea que no se pudo revisar, o que no se dejó escribir. */
const UNREVIEWED_LINE = "registro: una línea no se pudo revisar y no se escribió";

/**
 * `value` como texto. Es como el registro escribe un mensaje o una traza que no lo son (ADR-128
 * regla 2): lo que dice `String(value)`, y vacío si no hay nada, que es como un `Error` se escribe a
 * sí mismo sin mensaje. Lo que no se deja convertir (un `toString` que lanza, un objeto sin prototipo)
 * no se escribe: sale `[oculto]`. No lanza.
 */
function asText(value: unknown): string {
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
function textOf(error: object, field: "message" | "stack"): string {
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
function isErrorCode(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Lo que el registro recorta como un error: un `Error`, o lo que pino serializa como si lo fuera, un
 * objeto con un texto por `message` (ADR-128 regla 3). Así llega un error de otro contexto de
 * ejecución, donde `instanceof Error` no vale. Vale donde alguien dijo que eso es un error: bajo `err`
 * y como causa de otro. En cualquier otra parte un objeto con `message` es un dato.
 */
function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === "object" &&
      value !== null &&
      typeof (value as { message?: unknown }).message === "string")
  );
}

/** Las cuatro claves que el registro no escribe, estén donde estén. */
const HIDDEN_KEYS = ["password", "token", "code", "secret"];

/**
 * Las dos cabeceras que llevan la sesión. No son claves ocultas en cualquier parte: se ocultan bajo
 * `req.headers`, con `req` suelto en la línea, en lo que fija un logger hijo o en la raíz de lo que
 * se interpola en el mensaje (ADR-127 regla 9). Es donde las ocultaban las rutas de pino.
 */
const SESSION_HEADERS = ["cookie", "authorization"];

/**
 * La puerta de la revisión: una línea, o un objeto que se interpola, trae algo que revisar solo si
 * trae escrito así el nombre de una de las cuatro claves o de las dos cabeceras, que JSON no escapa
 * letras. Las dos cabeceras no son claves ocultas, pero sin nombrarlas acá la línea que trae solo una
 * cookie no se vuelve a leer (ADR-127 regla 9).
 */
const NAMES_SOMETHING_TO_REVIEW = new RegExp(
  `"(?:${[...HIDDEN_KEYS, ...SESSION_HEADERS].join("|")})":`,
);

/**
 * Dónde está lo que se recorre. Es lo único que cambia de un lugar a otro: qué clave se perdona y
 * cuál se oculta de más.
 *  - `line`: lo que una línea trae suelto. Su `err` es un error y su `req`, un request.
 *  - `error`: un error registrado como `err`. Deja leer su código (`57P01`, `ECONNRESET`), que es
 *    por lo que se busca en un incidente (ADR-118 regla 23), y lo que agrupa en `aggregateErrors`
 *    son errores igual: pino los lista ahí.
 *  - `errors`: esa lista.
 *  - `request`: un request registrado como `req`. Sus `headers` son sus cabeceras.
 *  - `headers`: esas cabeceras. Ahí se ocultan además las dos de sesión.
 *  - `data`: todo lo demás. Ahí no se perdona nada ni se oculta nada de más.
 */
type Place = "line" | "error" | "errors" | "request" | "headers" | "data";

/** Dónde queda lo que cuelga de `key`. */
function placeUnder(place: Place, key: string, inner: unknown): Place {
  if (place === "line" && key === "err") {
    return "error";
  }
  if (place === "line" && key === "req") {
    return "request";
  }
  if (place === "request" && key === "headers") {
    return "headers";
  }
  if (place === "error" && key === "aggregateErrors" && Array.isArray(inner)) {
    return "errors";
  }
  return "data";
}

/**
 * Oculta las cuatro claves en `value` y en todo lo que cuelga de él, sin tope de profundidad, y las
 * dos cabeceras de sesión donde van. Es el único recorrido de la redacción (ADR-123 regla 17,
 * ADR-127 regla 9): una clave oculta más se escribe en `HIDDEN_KEYS`, una cabecera de sesión más en
 * `SESSION_HEADERS`, y en ningún otro lado.
 */
function hideKeys(value: unknown, place: Place): void {
  if (Array.isArray(value)) {
    // Solo la lista de errores agrupados trae errores; cualquier otra, datos: una lista donde va el
    // `req` o donde van sus cabeceras no es ni lo uno ni lo otro.
    for (const item of value) {
      hideKeys(item, place === "errors" ? "error" : "data");
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const inner = record[key];
    if (place === "error" && key === "code" && isErrorCode(inner)) {
      continue;
    }
    if (HIDDEN_KEYS.includes(key) || (place === "headers" && SESSION_HEADERS.includes(key))) {
      record[key] = REDACTED;
    } else {
      hideKeys(inner, placeUnder(place, key, inner));
    }
  }
}

/**
 * La línea como va a salir, con las cuatro claves ocultas a cualquier profundidad (ADR-120 regla 9)
 * y las dos cabeceras de sesión ocultas bajo `req.headers`. Pino lleva solo las cuatro claves sueltas
 * (ADR-123 regla 15, ADR-127 regla 9): sus rutas no admiten «a cualquier profundidad», y con un
 * comodín o con una ruta anidada copia el valor entero de la clave de primer nivel para aplicarla, y
 * la copia de un `Buffer` no se deja serializar. Este paso mira lo que pino ya escribió, así que cubre
 * también lo que fija un logger hijo y lo que un objeto escribe con su `toJSON`. Solo vuelve a leer la
 * línea que nombra alguna de las cuatro claves o de las dos cabeceras; las demás salen como llegaron.
 * Una línea que no se puede revisar no se escribe.
 */
function withoutHiddenKeys(line: string): string {
  if (!NAMES_SOMETHING_TO_REVIEW.test(line)) {
    return line;
  }
  try {
    const record = JSON.parse(line) as Record<string, unknown>;
    hideKeys(record, "line");
    return `${JSON.stringify(record)}\n`;
  } catch {
    return `${JSON.stringify({ level: 50, time: Date.now(), msg: UNREVIEWED_LINE })}\n`;
  }
}

/**
 * Algo que solo sabe decir `text`: es lo que se interpola en lugar de un error. Donde va un texto
 * (`%s`) sale `text`; donde va un objeto (`%o`, `%O`, `%j`) sale vacío, como salía un error sin campos
 * propios, porque no lleva ninguno: nada de lo que el error trae colgado llega al mensaje.
 */
function sayingOnly(text: string): object {
  return Object.defineProperty({}, "toString", { value: () => text });
}

/**
 * Lo que queda de un error que cuelga de un objeto que se interpola: su código, si es un código, y
 * nada más de lo que trae colgado, que es donde van los valores (ADR-127 regla 8). Sin código queda
 * vacío, como ya salía ahí un error sin campos propios. Si ese código se lee o sale oculto lo decide
 * el recorrido, por el lugar: se lee bajo el `err` de la raíz, como en una línea.
 */
function hangingError(error: Error): object {
  const code = (error as { code?: unknown }).code;
  return isErrorCode(code) ? { code } : {};
}

/**
 * El error de una línea: ella misma o lo que trae bajo `err`, sea un `Error` o tenga su forma. De ahí
 * toma pino el mensaje que falta.
 */
function errorOfLine(line: unknown): Error | undefined {
  if (line instanceof Error) {
    return line;
  }
  const carried =
    typeof line === "object" && line !== null ? (line as { err?: unknown }).err : undefined;
  return isErrorLike(carried) ? carried : undefined;
}

/**
 * Lo que se interpola en el mensaje (`%o`, `%O`, `%j`) no llega a la línea como objeto: pino lo
 * escribe dentro de `msg`, y ahí `withoutHiddenKeys` ya no lo puede leer. Se revisa antes, con las
 * reglas de una línea y sin tope de profundidad (ADR-123 regla 15): si nombra alguna de las cuatro
 * claves o de las dos cabeceras de sesión, lo que se interpola es una copia con lo que toca oculto: el
 * código de su `err` se lee y las cabeceras de su `req` no. Lo que no es un objeto, o no nombra
 * ninguna, pasa como llegó. Un objeto que no se deja copiar (un ciclo, un `bigint`) no se puede
 * revisar y no se escribe.
 *
 * Un `Error` se cambia siempre, nombre o no una clave oculta (ADR-127 regla 8): por lo que dice de sí
 * mismo, su nombre y su mensaje sin los valores que repite (`withoutQueryValues`). Una copia plana
 * deja de ser un error, y `%s` la escribe «[object Object]»; y el error tal cual lleva sus valores al
 * mensaje, en el texto y en lo que trae colgado. El que cuelga de un objeto interpolado tampoco
 * escribe lo que trae colgado: de él queda su código (`hangingError`), y el objeto se copia aunque no
 * nombre ninguna clave. Tampoco sale por su propio `toJSON`, si lo escribe (ADR-128 regla 3).
 */
function reviewedForMessage(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  try {
    if (value instanceof Error) {
      return sayingOnly(withoutQueryValues(value, String(value)));
    }
    let carriesError = false;
    // El reemplazo recibe cada valor después de su `toJSON`, y `this` es quien lo trae: ahí está lo
    // que cuelga antes de escribirse. Se mira antes y después: el error que escribe su propio
    // `toJSON` no sale por él, y el que devuelve el `toJSON` de otro objeto tampoco sale entero.
    const written = JSON.stringify(value, function (this: unknown, key: string, inner: unknown) {
      const hanging = (this as Record<string, unknown>)[key];
      const error = hanging instanceof Error ? hanging : inner instanceof Error ? inner : undefined;
      if (error) {
        carriesError = true;
        return hangingError(error);
      }
      return inner;
    }) as string | undefined;
    if (written === undefined || !(carriesError || NAMES_SOMETHING_TO_REVIEW.test(written))) {
      return value;
    }
    const copy = JSON.parse(written) as Record<string, unknown>;
    hideKeys(copy, "line");
    return copy;
  } catch {
    return REDACTED;
  }
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

/** El código de un error, o el de su causa más cercana que traiga uno. */
export function errorCode(error: Error): string | number | undefined {
  const own = (error as { code?: unknown }).code;
  return isErrorCode(own) ? own : causeCode(error);
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
 */
export function carriesQueryError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (isQueryError(current)) {
      return true;
    }
    current = current.cause;
  }
  return false;
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
 * sus causas hasta cinco niveles: el tramo `params: …` que escribe Drizzle, el valor que cita un
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
 * en el mensaje y en la traza la causa que tiene un texto por `message`, sea o no un `Error`.
 *
 * No lanza (ADR-128 regla 2). `text` y el mensaje de cada error se leen como texto (`asText`), sean lo
 * que sean. Y si el error no se deja leer, o sus valores no se dejan escribir, no hay con qué recortar
 * y el texto no sale: devuelve `[oculto]`.
 */
export function withoutQueryValues(error: Error, text: string): string {
  try {
    let clean = asText(text);
    let current: unknown = error;
    for (let depth = 0; depth < 5 && isErrorLike(current); depth += 1) {
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
      current = current.cause;
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
 * Lanza si el error no se deja leer: de eso se ocupa `serializeError`.
 */
function trimmedError(error: unknown): unknown {
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
  const grouped = (error as { errors?: unknown }).errors;
  if (Array.isArray(grouped) && Array.isArray(serialized.aggregateErrors)) {
    serialized.aggregateErrors = grouped.map(serializeError);
  }
  return serialized;
}

/**
 * El serializador de `err`. No lanza (ADR-128 regla 2): lo que no se deja leer (un `Proxy`, un campo
 * que lanza al leerlo) no se escribe, sale `[oculto]`, y la línea conserva su mensaje y lo demás.
 */
function serializeError(error: unknown): unknown {
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

// JSON en producción, CI y archivos; el formateador con worker queda para la terminal local.
export const logger = pino({
  // `||` y no `??`: una variable vacía vale como ausente, igual que en `env.ts` (ADR-121 regla 8).
  // Con la cadena vacía pino lanza al crear el logger y el proceso no arranca.
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  base: null,
  serializers: { err: serializeError },
  hooks: {
    // El primer argumento, si es un objeto, es el de la línea, y a esa la revisa `streamWrite`. Los
    // demás son el mensaje y lo que se le interpola.
    logMethod(args, method) {
      try {
        const reviewed = args.map((arg, index) => (index === 0 ? arg : reviewedForMessage(arg)));
        // A la línea que llega sin mensaje pino le pone en `msg` el de su error, tal cual: con el
        // tramo `params: …` de una consulta y con el valor que cita una conversión. Llega ya
        // recortado y como texto, como sale en `err.message` de esa misma línea, y sin nada que
        // interpolarle (ADR-127 regla 8, ADR-128 regla 2).
        const error = reviewed[1] === undefined ? errorOfLine(reviewed[0]) : undefined;
        const line = error
          ? [reviewed[0], withoutQueryValues(error, textOf(error, "message"))]
          : reviewed;
        method.apply(this, line as typeof args);
      } catch {
        // El registro no lanza por lo que le piden anotar (ADR-128 regla 2). La línea que no se pudo
        // revisar, o que pino no pudo escribir (un `Proxy`, una clave que lanza al leerla), no sale:
        // sale este aviso en su lugar, con el nivel con que se pidió. Si lanza también, lo que falla
        // es el destino y no lo que se pidió anotar, y ese fallo sí sale.
        method.call(this, UNREVIEWED_LINE);
      }
    },
    // Lo que las rutas de abajo no alcanzan: todo lo que no está suelto en la línea (ADR-120 regla 9),
    // el código de `err` y las cabeceras de sesión de `req` (ADR-127 regla 9).
    streamWrite: withoutHiddenKeys,
  },
  redact: {
    // Solo las cuatro claves, sueltas en la línea o en lo que fija un logger hijo (ADR-119 regla 14).
    // Sin rutas con `*` ni anidadas: con una, pino copia entero el valor de la clave de primer nivel
    // para aplicarla, y la copia de un `Buffer` no se deja serializar (ADR-123 regla 15, ADR-127
    // regla 9). Lo que tiene una clave encima es de `withoutHiddenKeys`.
    paths: [...HIDDEN_KEYS],
    censor: REDACTED,
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
