import { describe, expect, it } from "vitest";
import { serializeError } from "@/shared/lib/error-sanitizer";
import { QUERY, queryError, untyped, VALUE } from "../helpers/log-fixtures";
import { captureLogs } from "../helpers/logs";

// DT-399, ADR-129 regla 5: lo que sale de recortar un objeto que cuelga de un error no depende del
// camino por el que se llega a él. Las formas escritas a mano viven en `log-error-shapes.test.ts`, y
// ninguna vio la regresión de `f4c099f4`: el objeto que solo nombra a uno de más arriba se guardaba
// como llegó, y por otro camino salía con el valor de una consulta. Acá los grafos los arma un
// generador con semilla fija, la misma serie en cada corrida: objetos, listas, errores y errores de
// consulta en sitios al azar, con aristas al azar que cierran ciclos y repiten un nodo por varios
// caminos, todo colgado de un error que se registra.
//
// No arma lo que la regla 5 deja en «Lo que queda»: la causa cuyo `message` no es un texto, el error
// bajo una clave de la línea que no es `err` ni lo que escribe un `toJSON`.

const { error } = untyped;

/** Cuántos grafos: las semillas van de 1 a este número. */
const GRAPHS = 300;

/**
 * Lo más que puede tardar un grafo en escribirse por las dos formas. Es holgado: la serie entera tarda
 * unos 300 ms y el grafo más lento unos 100, uno de los 13 con los que el serializador de pino lanza
 * antes del recorte y el `err` sale `[oculto]` entero, igual que salía antes de DT-399. Está para el
 * recorrido que no termina, no para el que se pone lento: con grafos de este tamaño, quitar lo ya
 * recortado no llega al tope, y lo que cae es la cuenta de lecturas de la otra prueba.
 */
const TIME_LIMIT_MS = 2_000;

/** Lo que va antes de la arroba: tampoco sale suelto. */
const LOCAL_PART = VALUE.slice(0, VALUE.indexOf("@"));

type Kind = "object" | "list" | "error" | "queryError" | "plainQueryError";

/** De qué puede ser un nodo; los que se repiten salen más seguido. */
const KINDS: readonly Kind[] = [
  "object",
  "object",
  "object",
  "list",
  "list",
  "error",
  "queryError",
  "plainQueryError",
];

/** Los que llevan el valor de una consulta: cada grafo trae al menos uno. */
const QUERY_KINDS: readonly Kind[] = ["queryError", "plainQueryError"];

/** Los campos con nombre de los que cuelga un nodo: los que el recorte y pino miran distinto, y otros. */
const FIELDS = [
  "cause",
  "original",
  "detail",
  "response",
  "request",
  "errors",
  "aggregateErrors",
] as const;

/** Un generador con semilla (mulberry32): devuelve la misma serie de números entre 0 y 1 cada vez. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

interface Graph {
  /** El error que se registra, con el grafo colgando. */
  root: Error;
  /** Cuántas veces se leyó cada nodo que es un objeto; los demás quedan en cero. */
  reads: number[];
}

/** El grafo de esa semilla: de 2 a 10 nodos, todos alcanzables desde el error, y aristas de más. */
function graphOf(seed: number): Graph {
  const random = seeded(seed);
  const below = (limit: number) => Math.floor(random() * limit);
  const pick = <T>(items: readonly T[]) => items[below(items.length)] as T;

  const size = 2 + below(9);
  const reads = Array.from({ length: size }, () => 0);
  const withQuery = below(size);
  const nodes = Array.from({ length: size }, (_, index): object => {
    const kind = index === withQuery ? pick(QUERY_KINDS) : pick(KINDS);
    switch (kind) {
      case "list":
        return [];
      case "error":
        return Object.assign(new Error(`nodo ${index}`), { id: index });
      case "queryError":
        return queryError();
      case "plainQueryError":
        // Un error de consulta que no es un `Error`: como llega de otro contexto de ejecución.
        return {
          message: `Failed query: ${QUERY}\nparams: ${VALUE}`,
          query: QUERY,
          params: [VALUE],
        };
      default:
        // Cuenta cuántas veces lo leen: `read` es una clave propia que se enumera.
        return Object.defineProperty({ id: index }, "read", {
          enumerable: true,
          get: () => {
            reads[index] = (reads[index] ?? 0) + 1;
            return true;
          },
        });
    }
  });

  let links = 0;
  /** `child` pasa a colgar de `holder`: al final si es una lista, por un campo libre si no. */
  const link = (holder: object, child: object) => {
    links += 1;
    if (Array.isArray(holder)) {
      holder.push(child);
      return;
    }
    const free = FIELDS.filter((field) => !Object.hasOwn(holder, field));
    const key = free.length > 0 && random() < 0.6 ? pick(free) : `k${links}`;
    Object.assign(holder, { [key]: child });
  };

  // Cada nodo cuelga de uno anterior: todos se alcanzan desde el primero.
  for (let index = 1; index < size; index += 1) {
    link(nodes[below(index)] as object, nodes[index] as object);
  }
  // Y aristas de más entre dos nodos cualesquiera: cierran ciclos, repiten un nodo por otro camino
  // o hacen que un nodo se nombre a sí mismo.
  const extra = size + below(size * 2);
  for (let count = 0; count < extra; count += 1) {
    link(nodes[below(size)] as object, nodes[below(size)] as object);
  }

  const root = Object.assign(new Error("fuera"), { first: nodes[0] });
  // El error trae además uno o dos nodos directo, y a veces un nodo lo nombra a él.
  for (let count = below(3); count > 0; count -= 1) {
    link(root, nodes[below(size)] as object);
  }
  if (random() < 0.3) {
    link(nodes[below(size)] as object, root);
  }
  return { root, reads };
}

describe("grafos generados que cuelgan de un error registrado (DT-399)", () => {
  // Trescientos grafos por dos formas de registrar: unos 300 ms en total. El límite de cada prueba, un
  // minuto, deja lugar a que varios grafos lleguen a su tope y la lista de los que fallan salga entera.
  // Medido al escribirla: sobre el saneo de `f4c099f4` el valor sale en 142 de los 300 grafos, y sin lo
  // ya recortado 197 leen un mismo objeto más de una vez, hasta 574.
  it("cada grafo se escribe por las dos formas de registrar un error, a tiempo y sin el valor de la consulta en ninguna parte de la línea", async () => {
    const failures: string[] = [];

    await captureLogs(async (written) => {
      for (let seed = 1; seed <= GRAPHS; seed += 1) {
        const { root } = graphOf(seed);
        const before = written.length;
        const started = performance.now();
        try {
          error({ err: root }, "falló");
          error(root);
        } catch (thrown) {
          failures.push(`${seed}: lanzó ${String(thrown)}`);
          continue;
        }
        const elapsed = performance.now() - started;
        const lines = written.slice(before);

        if (lines.length !== 2 || lines.some(({ record }) => record.err === undefined)) {
          failures.push(`${seed}: no escribió sus dos líneas con su \`err\``);
        }
        if (lines.some(({ line }) => line.includes(LOCAL_PART))) {
          failures.push(`${seed}: sale el valor de la consulta`);
        }
        if (elapsed > TIME_LIMIT_MS) {
          failures.push(`${seed}: tardó ${Math.round(elapsed)} ms`);
        }
      }
    });

    expect(failures).toEqual([]);
  }, 60_000);

  it("al recortar un grafo, cada objeto se lee una sola vez, se llegue a él por los caminos que se llegue", () => {
    const failures: string[] = [];

    for (let seed = 1; seed <= GRAPHS; seed += 1) {
      const { root, reads } = graphOf(seed);
      serializeError(root);
      const most = Math.max(...reads);
      if (most > 1) {
        failures.push(`${seed}: leyó ${most} veces un mismo objeto`);
      }
    }

    expect(failures).toEqual([]);
  }, 60_000);
});
