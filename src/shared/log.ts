import pino from "pino";
import {
  asText,
  isErrorCode,
  isErrorLike,
  REDACTED,
  serializeError,
  textOf,
  withoutQueryValues,
} from "@/shared/lib/error-sanitizer";

const isProduction = process.env.NODE_ENV === "production";
const pretty = !isProduction && !process.env.CI && process.stdout.isTTY;

/** Lo que sale en lugar de una línea que no se pudo revisar, o que no se dejó escribir. */
const UNREVIEWED_LINE = "registro: una línea no se pudo revisar y no se escribió";

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
 * toma pino el mensaje que falta, y solo si la línea no trae su propia clave `msg`: con ella no hay
 * mensaje que falte, y pasarle el del error escribía dos claves `msg` (ADR-129 regla 7).
 */
function errorOfLine(line: unknown): Error | undefined {
  if (line instanceof Error) {
    return line;
  }
  if (typeof line !== "object" || line === null) {
    return undefined;
  }
  const { err, msg } = line as { err?: unknown; msg?: unknown };
  return msg === undefined && isErrorLike(err) ? err : undefined;
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

/**
 * Los argumentos de una línea, con su mensaje como algo que pino sabe escribir. El mensaje es el
 * primero, o el segundo si el primero es el objeto de la línea o no hay. Un símbolo ahí sale como su
 * texto (`asText`, ADR-128 regla 2): pino lo pasa tal cual a la línea, que queda con `"msg":undefined`
 * y deja de ser JSON (ADR-129 regla 5). Lo que se interpola en el mensaje no cambia.
 */
function withWritableMessage(args: unknown[]): unknown[] {
  const at = typeof args[0] === "object" || args[0] === undefined ? 1 : 0;
  return typeof args[at] === "symbol"
    ? args.map((arg, index) => (index === at ? asText(arg) : arg))
    : args;
}

/**
 * Si `key` se llama como algo de `Object.prototype` (`hasOwnProperty`, `constructor`, `toString`,
 * `valueOf`, `__proto__`…). Al fijar lo de un hijo (`asChindings`), pino le pregunta a lo que recibe
 * con `bindings.hasOwnProperty(key)` y busca el serializador y el stringifier de cada clave en objetos
 * llanos (`serializers[key]`, `stringifiers[key]`). Una clave propia con uno de esos nombres tapa el
 * método o encuentra el heredado, y pino lanza o escribe una línea que no es JSON: no se le pasa.
 */
function namedLikeObjectPrototype(key: string): boolean {
  return key in Object.prototype;
}

/**
 * Lo que un logger hijo va a fijar, como un objeto que pino sabe leer (ADR-129 regla 6). Pino lo
 * serializa al crear el hijo y por ahí no pasa `hooks.logMethod`: con un objeto sin prototipo, con una
 * clave que lanza al leerla o con un `Proxy`, lanzaba él. Se copian las claves propias que se enumeran,
 * que son las que pino fija. La que lanza al leerla sale `[oculto]`, y de lo que no deja ni listar sus
 * claves no se fija nada. Tampoco se fija una clave propia que se llame como algo de `Object.prototype`
 * (`namedLikeObjectPrototype`), aunque se deje leer. Los valores no se tocan: pasan por el
 * serializador de `err` y por las rutas ocultas, como siempre.
 */
function readableBindings(bindings: unknown): Record<string, unknown> {
  const entries: [string, unknown][] = [];
  try {
    for (const key of Object.keys(bindings as object)) {
      if (namedLikeObjectPrototype(key)) {
        continue;
      }
      try {
        entries.push([key, (bindings as Record<string, unknown>)[key]]);
      } catch {
        entries.push([key, REDACTED]);
      }
    }
  } catch {
    // No deja listar sus claves, o no es un objeto: no hay qué fijar.
  }
  return Object.fromEntries(entries);
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
        const reviewed = withWritableMessage(
          args.map((arg, index) => (index === 0 ? arg : reviewedForMessage(arg))),
        );
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

// `logger.child(…)` y `logger.setBindings(…)` no lanzan por lo que les piden fijar (ADR-129 regla 6).
// Se envuelven en el logger que se exporta: pino crea cada hijo con su padre de prototipo, así que los
// hijos, y los hijos de un hijo, heredan estas dos funciones.
const pinoChild = logger.child;
logger.child = function child<Levels extends string = never>(
  this: unknown,
  bindings: pino.Bindings,
  options?: pino.ChildLoggerOptions<Levels>,
): pino.Logger<Levels> {
  return Reflect.apply(pinoChild, this, [readableBindings(bindings), options]);
};

const pinoSetBindings = logger.setBindings;
logger.setBindings = function setBindings(this: unknown, bindings: pino.Bindings): void {
  Reflect.apply(pinoSetBindings, this, [readableBindings(bindings)]);
};
