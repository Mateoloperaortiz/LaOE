import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { getEnv } from "@/env";
import { markConnectionFailure, printableError } from "@/shared/lib/error-sanitizer";
import { logger } from "@/shared/log";

// Next imprime con `console.error` el error que una action o una ruta dejan escapar, y lo hace
// antes de avisarle a `onRequestError` (ADR-120 regla 12). Un error de consulta impreso así trae sus
// valores tres veces: en el mensaje, en `params` y en el `detail` de su causa. Con esto, quien lo
// imprima, Next o cualquier `console.error`, escribe en su lugar la copia que se puede escribir. El
// error no cambia: el serializador del registro sigue leyendo sus `params` para recortarlos.
Object.defineProperty(DrizzleQueryError.prototype, Symbol.for("nodejs.util.inspect.custom"), {
  configurable: true,
  writable: true,
  value(
    this: Error,
    _depth: number,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ) {
    return inspect(printableError(this), options);
  },
});

/**
 * Lo que va al registro de una conexión que falló: qué pasó y el código de PostgreSQL, si lo trae.
 * Nunca el error entero, que puede traer la consulta, sus valores o dónde iba (`detail`, `where`,
 * `internalQuery`).
 */
function connectionFailure(error: Error): { name: string; code: string | null; message: string } {
  const code = (error as { code?: unknown }).code;
  return { name: error.name, code: typeof code === "string" ? code : null, message: error.message };
}

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/**
 * El pool de la casa. Todo fallo al abrir o prestar una conexión sale de él marcado con a dónde iba
 * (ADR-123 regla 16): solo acá se sabe que el error es de una conexión y contra qué host, y con esa
 * marca el registro le quita el host configurado, vaya o no entre comillas. `pool.query` y Drizzle
 * piden la conexión por `connect`, con callback o con promesa, así que basta redefinirlo. El error
 * es el mismo: quien lo recibe lo sigue leyendo igual.
 */
class MarkingPool extends Pool {
  private readonly connectionString: string;

  constructor(config: PoolConfig & { connectionString: string }) {
    super(config);
    this.connectionString = config.connectionString;
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<PoolClient> | undefined {
    if (callback) {
      super.connect((error, client, done) => callback(this.marked(error), client, done));
      return undefined;
    }
    return super.connect().catch((error: unknown) => {
      throw this.marked(error);
    });
  }

  private marked<T>(error: T): T {
    markConnectionFailure(error, this.connectionString);
    return error;
  }
}

// Un solo pool por proceso. Se crea al primer uso (no al importar) para que `next build`
// no necesite una base de datos.
function createDb() {
  const env = getEnv();
  const pool = new MarkingPool({
    connectionString: env.DATABASE_URL,
    max: 10,
    // ADR-079: pedir una conexión, una sentencia y una transacción abierta tienen límite.
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  });
  // Sin este listener, el error de un cliente inactivo (reinicio de Postgres, red) tumba el proceso.
  // pg-pool le cuelga la conexión al error (`err.client`), con su host, su puerto, su usuario y su
  // base: al registro va lo mismo que con la prestada, no el error entero.
  pool.on("error", (error) => {
    logger.error({ err: connectionFailure(error) }, "un cliente inactivo del pool falló");
  });
  // El de arriba solo cubre a las inactivas: pg-pool le pone su oyente a la conexión que guarda y se
  // lo quita al prestarla. Si PostgreSQL cierra una prestada con la transacción abierta y sin consulta
  // en curso (reinicio, failover, `pg_terminate_backend`, el límite de ADR-079 regla 1), su `error`
  // no tenía quién lo oyera y era una excepción sin atrapar del proceso (ADR-119 regla 13). Este
  // oyente dura lo que la conexión y solo deja constancia: la operación que la usaba falla con su
  // propio error en su siguiente consulta, y el pool la retira al devolverla.
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      // Inactiva, la oye también pg-pool, que avisa por el `error` del pool: no se registra dos veces.
      if (client.listenerCount("error") > 1) {
        return;
      }
      logger.error({ err: connectionFailure(error) }, "una conexión prestada del pool falló");
    });
  });
  return drizzle({ client: pool, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;

const globalRef = globalThis as typeof globalThis & { __casaDigitalDb?: Db | undefined };

export function getDb(): Db {
  // El HMR de `next dev` reevalúa los módulos; el pool debe sobrevivir en globalThis.
  globalRef.__casaDigitalDb ??= createDb();
  return globalRef.__casaDigitalDb;
}

/** Cierra el pool; solo lo usan scripts y pruebas para que el proceso termine. */
export async function closeDb(): Promise<void> {
  const db = globalRef.__casaDigitalDb;
  globalRef.__casaDigitalDb = undefined;
  await db?.$client.end();
}
