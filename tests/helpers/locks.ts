import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand, type Tx } from "@/db/tx";

// Candados retenidos a propósito. Lanzar dos solicitudes a la vez no fija cuál entra primero: la prueba
// deja una transacción escrita y sin confirmar, le pregunta a PostgreSQL si la otra ya hace cola y
// recién entonces la suelta.

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export interface Held {
  /** La conexión que retiene: `waitingOn(pid)` dice cuántas la esperan. */
  pid: number;
  release: () => void;
  done: Promise<unknown>;
}

export async function backendPid(tx: Tx): Promise<number> {
  const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return result.rows[0]?.pid ?? 0;
}

/** Retiene en otra conexión las filas o los candados que `take` tome, hasta soltarlos. */
export async function holdTransaction(take: (tx: Tx) => Promise<unknown>): Promise<Held> {
  const ready = deferred<number>();
  const release = deferred<void>();
  const done = getDb().transaction(async (tx) => {
    await take(tx);
    ready.resolve(await backendPid(tx));
    await release.promise;
  });
  void done.catch(ready.reject);
  return { pid: await ready.promise, release: () => release.resolve(), done };
}

/** Deja un comando escrito y sin confirmar hasta soltarlo: fija cuál de los dos entra primero. */
export async function holdCommand(
  actor: Actor,
  command: (ctx: CommandContext) => Promise<unknown>,
): Promise<Held> {
  const ready = deferred<number>();
  const release = deferred<void>();
  const done = runCommand(actor, async (ctx) => {
    await command(ctx);
    ready.resolve(await backendPid(ctx.tx));
    await release.promise;
  });
  void done.catch(ready.reject);
  return { pid: await ready.promise, release: () => release.resolve(), done };
}

/** Cuántas conexiones esperan un candado de la transacción indicada, según PostgreSQL. */
export async function waitingOn(pid: number): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows[0]?.n ?? 0;
}

/** Cuántas conexiones de esta base esperan un candado, de quien sea. */
export async function waitingForLock(): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `);
  return result.rows[0]?.n ?? 0;
}

async function until(check: () => Promise<boolean>, otherwise: string): Promise<void> {
  // Cuenta intentos y no milisegundos: hay pruebas que congelan `Date`.
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(otherwise);
}

/**
 * Fija el orden de dos comandos completos. Lanza el primero y espera a que se detenga en lo que
 * `held` retiene; lanza el segundo y espera a que haga cola; recién entonces suelta y devuelve cómo
 * terminó cada uno. Si el segundo termina sin esperar a nadie, falla: nada lo serializa con el primero.
 */
export async function firstThenSecond<A, B>(
  held: Held,
  first: () => Promise<A>,
  second: () => Promise<B>,
): Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> {
  const running: Promise<unknown>[] = [];
  const launch = <T>(command: () => Promise<T>): Promise<T> => {
    const promise = command();
    void promise.catch(() => undefined);
    running.push(promise);
    return promise;
  };
  try {
    const a = launch(first);
    await until(
      async () => (await waitingOn(held.pid)) === 1,
      "El primer comando no llegó a esperar lo retenido",
    );
    const b = launch(second);
    const early: { outcome: string | null } = { outcome: null };
    void b.then(
      () => {
        early.outcome = "ok";
      },
      (error: unknown) => {
        early.outcome = error instanceof Error ? error.message : String(error);
      },
    );
    await until(
      async () => early.outcome !== null || (await waitingForLock()) === 2,
      "El segundo comando no quedó esperando un candado",
    );
    if (early.outcome !== null) {
      throw new Error(`El segundo comando no esperó al primero: terminó con «${early.outcome}»`);
    }
    held.release();
    await held.done;
    return await Promise.allSettled([a, b]);
  } finally {
    held.release();
    await Promise.allSettled([held.done, ...running]);
  }
}

/**
 * Cómo termina `command` mientras `held` sigue retenido: «ok» o el mensaje de su error si no
 * necesitó nada de lo retenido, y «hizo cola» si PostgreSQL lo ve esperándolo. No espera tiempo: cada
 * vuelta es una consulta, y sale cuando el comando termina o cuando hace cola. Quien llama suelta
 * `held` después.
 */
export async function whileHeld(held: Held, command: () => Promise<unknown>): Promise<string> {
  const settled: { outcome: string | null } = { outcome: null };
  const running = command().then(
    () => {
      settled.outcome = "ok";
    },
    (error: unknown) => {
      settled.outcome = error instanceof Error ? error.message : String(error);
    },
  );
  try {
    while (settled.outcome === null) {
      if ((await waitingOn(held.pid)) > 0) {
        return "hizo cola";
      }
    }
    return settled.outcome;
  } finally {
    held.release();
    await Promise.allSettled([held.done, running]);
  }
}

/**
 * `whileHeld` y, además, cómo terminó el comando una vez suelto `held`: para la prueba que quiere ver
 * que hizo cola y también con qué respondió después de volver a leer lo que el otro dejó escrito.
 */
export async function heldThenSettled<T>(
  held: Held,
  command: () => Promise<T>,
): Promise<{ during: string; after: PromiseSettledResult<T> }> {
  const settled: PromiseSettledResult<T>[] = [];
  const during = await whileHeld(held, async () => {
    settled.push(...(await Promise.allSettled([command()])));
  });
  const [after] = settled;
  if (!after) {
    throw new Error("El comando no llegó a terminar");
  }
  return { during, after };
}

/** «ok» o el mensaje del error, con su causa: el del driver trae ahí lo que dijo PostgreSQL. */
export function outcome(result: PromiseSettledResult<unknown>): string {
  if (result.status === "fulfilled") {
    return "ok";
  }
  const error = result.reason as Error;
  const cause = error.cause instanceof Error ? ` <- ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}
