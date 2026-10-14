import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { logger } from "@/shared/log";
import { backendPid } from "../helpers/locks";

// Una conexión prestada del pool no tenía quién oyera su `error` (DT-238, ADR-119 regla 13): el
// oyente del pool es de las inactivas y pg-pool se lo quita a la conexión al prestarla. Si PostgreSQL
// la cerraba con una transacción abierta y sin consulta en curso (un reinicio, un failover, un
// `pg_terminate_backend` o el límite de «idle in transaction» de ADR-079 regla 1), ese `error` sin
// oyente era una excepción sin atrapar del proceso. Vitest la reporta y falla la corrida: ese fue el
// rojo, aquí y en las pruebas del poller que cierran su conexión (`outbox.test.ts`).

/** Los mensajes de un error y de sus causas, de afuera hacia adentro. */
function messagesOf(error: unknown): string[] {
  const messages: string[] = [];
  for (let current = error; current instanceof Error; current = current.cause) {
    messages.push(current.message);
  }
  return messages;
}

describe("una conexión prestada que PostgreSQL cierra", () => {
  afterEach(() => void vi.restoreAllMocks());
  afterAll(() => closeDb());

  it("con la transacción abierta y sin consulta en curso deja su error en el registro, la operación falla con el suyo y el proceso sigue", async () => {
    const logged = vi.spyOn(logger, "error");
    const command = runCommand(SYSTEM_ACTOR, async (ctx) => {
      const pid = await backendPid(ctx.tx);
      // Desde otra conexión, como lo haría la base al reiniciarse.
      await getDb().execute(sql`select pg_terminate_backend(${pid}, 5000)`);
      // La transacción sigue abierta y no tiene consulta en curso cuando llega el cierre.
      await expect.poll(() => logged.mock.calls.length).toBeGreaterThan(0);
      await ctx.tx.execute(sql`select 1`);
    });

    // La operación no se entera por el oyente: falla sola, en su siguiente consulta.
    const failure = await command.then(
      () => null,
      (error: unknown) => error,
    );
    expect(messagesOf(failure).join(" | ")).toMatch(/not queryable|terminated|terminating/);

    // Al registro va qué pasó, con el logger de la casa y sin nada de la consulta.
    const entries = logged.mock.calls.map(([facts, message]) => ({
      err: (facts as { err: Record<string, unknown> }).err,
      message,
    }));
    for (const entry of entries) {
      expect(entry.message).toBe("una conexión prestada del pool falló");
      expect(Object.keys(entry.err).sort()).toEqual(["code", "message", "name"]);
    }
    expect(entries.map((entry) => entry.err.code)).toContain("57P01");

    // El proceso sigue: el pool retira la conexión rota y presta otra.
    const again = await runCommand(SYSTEM_ACTOR, async (ctx) => {
      const result = await ctx.tx.execute<{ ok: number }>(sql`select 1 as ok`);
      return result.rows[0]?.ok;
    });
    expect(again).toBe(1);
  });

  it("inactiva, se registra una sola vez, por el oyente del pool, y con lo mismo que la prestada: nombre, código y mensaje", async () => {
    // El oyente por conexión sigue puesto mientras la conexión descansa, junto al de pg-pool.
    const logged = vi.spyOn(logger, "error");
    const pool = getDb().$client;
    const [idle, other] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const found = await idle.query<{ pid: number }>("select pg_backend_pid() as pid");
      idle.release();
      await other.query("select pg_terminate_backend($1, 5000)", [found.rows[0]?.pid ?? 0]);
      await expect.poll(() => logged.mock.calls.length).toBeGreaterThan(0);
    } finally {
      other.release();
    }
    // Una vuelta más a la base: si el segundo aviso de la conexión rota fuera a registrarse, ya llegó.
    await pool.query("select 1");

    expect(logged.mock.calls.map(([, message]) => message)).toEqual([
      "un cliente inactivo del pool falló",
    ]);
    // pg-pool le cuelga la conexión al error (`err.client`), con el host, el puerto, el usuario y la
    // base: al registro no va el error entero (DT-277).
    const [facts] = logged.mock.calls[0] ?? [];
    const err = (facts as { err: Record<string, unknown> }).err;
    expect(Object.keys(err).sort()).toEqual(["code", "message", "name"]);
    expect(err.code).toBe("57P01");
  });
});
