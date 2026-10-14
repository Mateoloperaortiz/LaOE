import { Client } from "pg";

// Cuenta lo que una lectura le manda a PostgreSQL. Toda consulta del proceso pasa por `Client.query`
// de `pg`, venga del pool (`getDb().select()…`, que pide una conexión por consulta) o de una conexión
// prestada (una transacción): el ayudante lo envuelve mientras corre la función y lo devuelve al
// terminar. No toca `src` ni depende de la configuración del contenedor (no usa `pg_stat_statements`).
//
// Cuenta todo lo que el proceso mande mientras la función corre, no solo lo que ella pida: sirve
// porque las pruebas de integración van de a un archivo y de a una prueba. Quien lo use no deja otra
// consulta en vuelo.

export interface CountedQuery {
  /** El SQL como salió, con sus `$1`: los valores no se guardan. */
  text: string;
  /** Las filas que devolvió; 0 mientras no responda o si falla. */
  rows: number;
}

type AnyQuery = (this: Client, ...args: unknown[]) => unknown;

function textOf(config: unknown): string {
  if (typeof config === "string") {
    return config;
  }
  const text = (config as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : "";
}

function rowsOf(result: unknown): number {
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Corre `run` y devuelve su resultado con las consultas que salieron mientras tanto, en el orden en
 * que se mandaron. Una transacción cuenta también su `begin` y su `commit`: cada uno es un viaje a la
 * base.
 */
export async function countQueries<T>(
  run: () => Promise<T>,
): Promise<{ result: T; queries: CountedQuery[] }> {
  const queries: CountedQuery[] = [];
  const prototype = Client.prototype as unknown as { query: AnyQuery };
  const original = prototype.query;
  prototype.query = function counted(this: Client, ...args: unknown[]) {
    const entry: CountedQuery = { text: textOf(args[0]), rows: 0 };
    queries.push(entry);
    // El pool manda la consulta con un callback al final; una conexión prestada recibe una promesa.
    const callback = args.at(-1);
    if (typeof callback === "function") {
      args[args.length - 1] = (error: unknown, result: unknown) => {
        entry.rows = rowsOf(result);
        callback(error, result);
      };
      return original.apply(this, args);
    }
    const sent = original.apply(this, args);
    if (sent instanceof Promise) {
      return sent.then((result: unknown) => {
        entry.rows = rowsOf(result);
        return result;
      });
    }
    return sent;
  };
  try {
    return { result: await run(), queries };
  } finally {
    prototype.query = original;
  }
}
