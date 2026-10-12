import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Cuatro rechazos de PostgreSQL a una conexión que ya se autenticó, provocados contra el servidor de
// las pruebas y registrados como lo hacen el poller y el programador (DT-307 inciso d, ADR-120 regla
// 10): un rol en su tope de conexiones, una base en el suyo, una base que no acepta conexiones y un
// rol sin permiso de conectar. `tests/unit/log-connection-failure.test.ts` los prueba con el mensaje
// escrito a mano; acá el mensaje lo escribe el servidor, y cada caso lo compara letra por letra.
//
// Los roles y las bases son del clúster entero, que en local comparten otros worktrees y el
// desarrollo: los de acá son sintéticos, con un nombre único por corrida, y esta prueba los crea y
// los borra. A un rol o a una base que ya exista no se le cambia nada, y la configuración del
// servidor no se toca. Si el proceso muere antes del `afterAll` quedan en el clúster sin chocar con
// otra corrida: se reconocen por `sintetic` y `c15` en el nombre.

const RUN = `c15_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
const PASSWORD = "clave-sintetica";
const VALUE = "valor.privado@eafit.edu.co";
const SQL = "select $1::text";

const ROLES = {
  /** Entra a toda base que deje entrar a cualquiera. */
  plain: `rol_llano_sintetico_${RUN}`,
  capped: `rol_con_tope_sintetico_${RUN}`,
};
const DATABASES = {
  /** Sin tope ni permisos quitados: a dónde va el rol que no entra por su propio tope. */
  open: `base_abierta_sintetica_${RUN}`,
  capped: `base_con_tope_sintetica_${RUN}`,
  closed: `base_cerrada_sintetica_${RUN}`,
  denied: `base_sin_permiso_sintetica_${RUN}`,
};

// `template0` no admite conexiones: copiarla no falla porque otro worktree esté conectado a la
// plantilla. Un superusuario se salta los topes y el permiso de conectar, y por eso entra un rol llano.
const CREATE = [
  `create role "${ROLES.plain}" login password '${PASSWORD}'`,
  `create role "${ROLES.capped}" login password '${PASSWORD}' connection limit 0`,
  `create database "${DATABASES.open}" template template0`,
  `create database "${DATABASES.capped}" template template0 connection limit 0`,
  `create database "${DATABASES.closed}" template template0 allow_connections false`,
  `create database "${DATABASES.denied}" template template0`,
  `revoke connect on database "${DATABASES.denied}" from public`,
];
const DROP = [
  ...Object.values(DATABASES).map((name) => `drop database if exists "${name}" with (force)`),
  ...Object.values(ROLES).map((name) => `drop role if exists "${name}"`),
];

/**
 * Cada rechazo: con qué rol y a qué base va la conexión, y el SQLSTATE y el mensaje de PostgreSQL.
 * `hiddenByCode` dice si el recorte oculta lo que el mensaje cita con solo mirar su código
 * (`QUOTES_A_VALUE`, `src/shared/log.ts`) o si depende de que la conexión configurada lo nombre.
 */
const REFUSALS = [
  {
    name: "el rol llegó a su tope de conexiones",
    role: ROLES.capped,
    database: DATABASES.open,
    code: "53300",
    message: `too many connections for role "${ROLES.capped}"`,
    hiddenByCode: true,
  },
  {
    name: "la base llegó a su tope de conexiones",
    role: ROLES.plain,
    database: DATABASES.capped,
    code: "53300",
    message: `too many connections for database "${DATABASES.capped}"`,
    hiddenByCode: true,
  },
  {
    name: "la base no acepta conexiones",
    role: ROLES.plain,
    database: DATABASES.closed,
    code: "55000",
    message: `database "${DATABASES.closed}" is not currently accepting connections`,
    hiddenByCode: false,
  },
  {
    name: "el rol no tiene permiso de conectar",
    role: ROLES.plain,
    database: DATABASES.denied,
    code: "42501",
    message: `permission denied for database "${DATABASES.denied}"`,
    hiddenByCode: false,
  },
];

const hidden = (message: string) => message.replace(/"[^"]*"/, '"[oculto]"');

async function withClient<T>(
  connectionString: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Antes de crear nada: si quien entra por `connectionString` no puede crear roles y bases, lo dice
 * acá, y no con el «permission denied» que respondería PostgreSQL a mitad de la preparación.
 */
async function assertCanCreateRolesAndDatabases(connectionString: string): Promise<void> {
  const can = await withClient(connectionString, async (client) => {
    const { rows } = await client.query<{ can: boolean }>(
      "select rolsuper or (rolcreaterole and rolcreatedb) as can from pg_roles where rolname = current_user",
    );
    return rows[0]?.can === true;
  });
  if (!can) {
    throw new Error(
      "Estas pruebas crean roles y bases sintéticos en el PostgreSQL de las pruebas, y el usuario de DATABASE_URL no puede crear roles ni bases: tiene que ser superusuario o tener CREATEROLE y CREATEDB, como el POSTGRES_USER de compose.yaml y del CI",
    );
  }
}

/** Los roles y las bases de esta corrida que siguen en el clúster. */
async function remaining(connectionString: string): Promise<string[]> {
  return withClient(connectionString, async (client) => {
    const { rows } = await client.query<{ name: string }>(
      `select datname::text as name from pg_database where datname = any($1)
       union all
       select rolname::text from pg_roles where rolname = any($1)`,
      [[...Object.values(DATABASES), ...Object.values(ROLES)]],
    );
    return rows.map((row) => row.name);
  });
}

async function failureOf(
  db: Pick<NodePgDatabase, "execute" | "transaction">,
  how: "consulta" | "transacción",
): Promise<Error> {
  try {
    if (how === "consulta") {
      await db.execute(sql`select ${VALUE}::text`);
    } else {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }
  throw new Error("la conexión abrió y no debía");
}

describe("un rechazo de PostgreSQL a la conexión, provocado contra el servidor", () => {
  const house = globalThis as typeof globalThis & { __casaDigitalDb?: unknown };
  // La de las pruebas, leída antes de que un caso apunte la casa a otra parte.
  const testDatabase = process.env.DATABASE_URL ?? "";
  let original: unknown;
  let mayHaveCreated = false;

  function connectionOf(role: string, database: string): string {
    const url = new URL(testDatabase);
    url.username = role;
    url.password = PASSWORD;
    url.pathname = `/${database}`;
    return url.toString();
  }

  /** La casa recién cargada: su pool, su registro y quien lo captura. Con `connectionString`, va ahí. */
  async function freshHouse(connectionString?: string) {
    vi.resetModules();
    if (connectionString) {
      vi.stubEnv("DATABASE_URL", connectionString);
    }
    house.__casaDigitalDb = undefined;
    const [{ getDb, closeDb }, { logger, withoutQueryValues }, { captureLogs }] = await Promise.all(
      [import("@/db/client"), import("@/shared/log"), import("../helpers/logs")],
    );
    return { getDb, closeDb, logger, withoutQueryValues, captureLogs };
  }

  beforeAll(async () => {
    original = house.__casaDigitalDb;
    await assertCanCreateRolesAndDatabases(testDatabase);
    mayHaveCreated = true;
    await withClient(testDatabase, async (admin) => {
      for (const statement of CREATE) {
        await admin.query(statement);
      }
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    house.__casaDigitalDb = original;
    if (!mayHaveCreated) {
      return;
    }
    // Cada borrado se intenta aunque otro falle, y lo que quede en el clúster pone el archivo en rojo.
    await withClient(testDatabase, async (admin) => {
      for (const statement of DROP) {
        await admin.query(statement).catch(() => {});
      }
    });
    expect(await remaining(testDatabase)).toEqual([]);
  });

  it("el rol llano entra a la base abierta, y como no puede crear roles ni bases la preparación se lo diría sin pedirle nada más al servidor", async () => {
    await expect(
      assertCanCreateRolesAndDatabases(connectionOf(ROLES.plain, DATABASES.open)),
    ).rejects.toThrow(
      /^Estas pruebas crean roles y bases sintéticos.+no puede crear roles ni bases/,
    );
  });

  describe.each(["consulta", "transacción"] as const)("por una %s del pool de la casa", (how) => {
    it.each(
      REFUSALS,
    )("si $name, ni el rol ni la base salen en la línea ni en lo que se guarda, y el SQLSTATE sigue legible", async ({
      role,
      database,
      code,
      message,
    }) => {
      const { getDb, closeDb, logger, withoutQueryValues, captureLogs } = await freshHouse(
        connectionOf(role, database),
      );
      let error: Error;
      try {
        error = await failureOf(getDb(), how);
      } finally {
        await closeDb();
      }
      expect(error instanceof DrizzleQueryError).toBe(how === "consulta");
      // El error de verdad, con la redacción del servidor: es lo que el registro tiene que limpiar.
      expect(how === "consulta" ? error.cause : error).toMatchObject({ code, message });

      const { lines } = await captureLogs(async () => {
        // Las dos líneas, como las escriben `src/jobs/poller.ts` y `src/jobs/scheduler.ts`.
        logger.error({ err: error }, "el poller falló");
        logger.error({ err: error, schedule: "permanencia" }, "no se pudo encolar el programado");
      });

      expect(lines).toHaveLength(2);
      for (const { line, record } of lines) {
        for (const written of [role, database, VALUE]) {
          expect(line).not.toContain(written);
        }
        const err = record.err as Record<string, unknown>;
        expect(err.code).toBe(code);
        expect(String(err.message)).toContain(hidden(message));
        expect(String(err.stack)).toContain(hidden(message));
        if (how === "consulta") {
          // El SQL de la consulta que falló se queda, con sus marcadores.
          expect(err.query).toBe(SQL);
        }
      }
      // Lo que el poller guarda en `outbox.last_error` pasa por el mismo recorte (ADR-119 regla 16).
      const stored = withoutQueryValues(error, error.message);
      for (const written of [role, database, VALUE]) {
        expect(stored).not.toContain(written);
      }
      if (how === "transacción") {
        expect(stored).toBe(hidden(message));
      }
    });
  });

  // Arriba la conexión configurada nombra al rol y a la base, y de ahí sale que no se vean: eso se
  // quita de cualquier mensaje. Sin ese nombre queda lo que el recorte reconoce por el código, y el
  // 42501 y el 55000 no entran porque citan también una tabla o una secuencia, que sirven para
  // depurar. Es el límite que anota DT-307 en su inciso (f), dicho con los errores del servidor: hoy
  // el único pool es el de la casa, y su conexión es la configurada.
  describe("por un pool que no es el de la casa, con una conexión que la configurada no nombra", () => {
    it.each(
      REFUSALS,
    )("si $name, lo que el mensaje cita se oculta solo si el recorte reconoce su SQLSTATE (DT-307 inciso f)", async ({
      role,
      database,
      code,
      message,
      hiddenByCode,
    }) => {
      const { logger, withoutQueryValues, captureLogs } = await freshHouse();
      const pool = new Pool({
        connectionString: connectionOf(role, database),
        connectionTimeoutMillis: 5_000,
      });
      let error: Error;
      try {
        error = await failureOf(drizzle({ client: pool }), "transacción");
      } finally {
        await pool.end();
      }

      const { lines } = await captureLogs(async () => {
        logger.error({ err: error }, "falló");
      });

      const kept = hiddenByCode ? hidden(message) : message;
      expect(lines[0]?.record.err).toMatchObject({ code, message: kept });
      expect(withoutQueryValues(error, error.message)).toBe(kept);
    });
  });
});
