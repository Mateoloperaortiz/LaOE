import { count, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain, processOne } from "@/jobs/poller";
import { getHandlers, registerHandler, resetHandlersForTests } from "@/jobs/registry";
import { enqueueScheduled } from "@/jobs/scheduler";
import { listOutbox, retryDeadLetter } from "@/modules/system/domain/outbox";
import { auditLog, outbox } from "@/modules/system/schema";
import { deferred } from "../helpers/locks";
import { truncateAll } from "./db";

const db = () => getDb();

describe("poller del outbox", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHandlersForTests();
  });
  afterEach(() => resetHandlersForTests());
  afterAll(() => closeDb());

  it("dos pollers compitiendo procesan cada fila exactamente una vez", async () => {
    const seen = new Map<string, number>();
    registerHandler("test.count", async (payload) => {
      const key = String(payload.n);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    for (let n = 0; n < 12; n += 1) {
      await enqueueEvent(db(), { type: "test.count", payload: { n } });
    }
    const [a, b] = await Promise.all([drain(50), drain(50)]);
    expect(a.processed + b.processed).toBe(12);
    expect(a.failed + b.failed).toBe(0);
    expect(seen.size).toBe(12);
    expect([...seen.values()].every((times) => times === 1)).toBe(true);
    const [pending] = await db().select({ n: count() }).from(outbox).where(eq(outbox.attempts, 0));
    expect(pending?.n).toBe(0);
  });

  it("un handler que no vuelve deja de frenar la cola: falla con backoff y no arranca los que le seguían", async () => {
    let release: () => void = () => {};
    let second = 0;
    registerHandler(
      "test.hang",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    registerHandler("test.hang", async () => {
      second += 1;
    });
    await enqueueEvent(db(), { type: "test.hang", payload: {} });
    const now = new Date();
    expect(await processOne(now, 50)).toBe("failed");
    const [row] = await db().select().from(outbox);
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("El evento test.hang superó 50 ms");
    expect(row?.processedAt).toBeNull();
    expect((row?.nextAttemptAt.getTime() ?? 0) - now.getTime()).toBe(60_000);
    // El handler abandonado termina tarde: la cadena no sigue con el segundo.
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second).toBe(0);
  });

  it("un handler que falla reintenta con backoff y muere al quinto fallo; reintentar lo revive", async () => {
    registerHandler("test.fail", async () => {
      throw new Error("no hoy");
    });
    await enqueueEvent(db(), { type: "test.fail", payload: {} });
    const now = new Date();
    expect(await processOne(now)).toBe("failed");
    let [row] = await db().select().from(outbox);
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("no hoy");
    expect(row?.deadLetterAt).toBeNull();
    expect((row?.nextAttemptAt.getTime() ?? 0) - now.getTime()).toBe(60_000);
    expect(await processOne(now)).toBe("idle"); // todavía no toca

    for (let i = 0; i < 4; i += 1) {
      const later = new Date(now.getTime() + 24 * 60 * 60_000 * (i + 1));
      expect(await processOne(later)).toBe("failed");
    }
    [row] = await db().select().from(outbox);
    expect(row?.attempts).toBe(5);
    expect(row?.deadLetterAt).toBeInstanceOf(Date);

    const id = row?.id ?? "";
    const revived = await runCommand(SYSTEM_ACTOR, (ctx) => retryDeadLetter(ctx, id));
    expect(revived).toBe(true);
    [row] = await db().select().from(outbox);
    expect(row?.deadLetterAt).toBeNull();
    expect(row?.attempts).toBe(0);
    const [audits] = await db()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.action, "outbox.retried"));
    expect(audits?.n).toBe(1);
  });

  // Conducta de hoy, fijada sin elegir: la decisión abierta 40 pregunta si esto debe ser un fallo.
  it("un evento de dominio sin suscriptores se da por procesado, sin error ni dead letter (ADR-034, decisión abierta 40)", async () => {
    await enqueueEvent(db(), { type: "nadie.lo.atiende", payload: {} });
    expect(await processOne()).toBe("processed");
    const [row] = await db().select().from(outbox);
    expect(row?.processedAt).toBeInstanceOf(Date);
    expect(row?.lastError).toBeNull();
    expect(row?.deadLetterAt).toBeNull();
    expect(row?.attempts).toBe(1);
    expect(await processOne()).toBe("idle");
  });

  it("varios handlers del mismo evento corren en orden antes de marcarlo procesado", async () => {
    const order: string[] = [];
    registerHandler("dos.oyen", async () => {
      order.push("primero");
    });
    registerHandler("dos.oyen", async () => {
      order.push("segundo");
    });
    await enqueueEvent(db(), { type: "dos.oyen", payload: {} });
    expect(await processOne()).toBe("processed");
    expect(order).toEqual(["primero", "segundo"]);
  });

  describe("clave de deduplicación", () => {
    const KEY = "prueba:clave";
    const emit = () => enqueueEvent(db(), { type: "test.key", payload: {}, dedupeKey: KEY });

    it("dos emits con la misma clave todavía sin tomar dejan un solo evento; procesado, la clave admite otro", async () => {
      let runs = 0;
      registerHandler("test.key", async () => {
        runs += 1;
      });
      await emit();
      await emit();
      expect(await db().select().from(outbox)).toHaveLength(1);
      expect(await processOne()).toBe("processed");
      expect(await processOne()).toBe("idle");
      expect(runs).toBe(1);

      await emit();
      const rows = await db().select().from(outbox);
      expect(rows).toHaveLength(2);
      // La fila procesada conserva su clave: es lo que muestra /admin/sistema/jobs.
      expect(rows.map((row) => row.dedupeKey)).toEqual([KEY, KEY]);
    });

    it("un evento que espera su reintento descarta el emit nuevo con su clave: el reintento corre después y lee fresco", async () => {
      let fail = true;
      let runs = 0;
      registerHandler("test.key", async () => {
        runs += 1;
        if (fail) {
          throw new Error("todavía no");
        }
      });
      await emit();
      const now = new Date();
      expect(await processOne(now)).toBe("failed");
      await emit();
      const rows = await db().select().from(outbox);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.dedupeKey).toBe(KEY);

      fail = false;
      expect(await processOne(new Date(now.getTime() + 60_000))).toBe("processed");
      expect(runs).toBe(2);
    });
  });

  describe("un evento en curso", () => {
    /** Deja `processOne` detenido adentro del handler hasta soltarlo. */
    async function holdInHandler(type: string) {
      const started = deferred<void>();
      const gate = deferred<void>();
      registerHandler(type, async () => {
        started.resolve();
        await gate.promise;
      });
      await enqueueEvent(db(), { type, payload: {} });
      const running = processOne();
      await started.promise;
      return { running, release: () => gate.resolve() };
    }

    it("no lo toma otro poller, tampoco con el reloj adelantado", async () => {
      const held = await holdInHandler("test.held");
      const tomorrow = new Date(Date.now() + 24 * 60 * 60_000);
      expect(await processOne(tomorrow)).toBe("idle");
      held.release();
      expect(await held.running).toBe("processed");
      expect(await processOne(tomorrow)).toBe("idle");
    });

    it("tiene el intento contado desde que se toma y queda fuera del alcance de un poller de la versión anterior", async () => {
      const before = Date.now();
      const held = await holdInHandler("test.held");
      const [taken] = await db().select().from(outbox);
      held.release();
      expect(await held.running).toBe("processed");
      expect(taken?.attempts).toBe(1);
      // El poller anterior al ciclo 6 solo mira filas vencidas (`nextAttemptAt <= ahora`): la toma
      // confirmada la deja sin vencer lo que esperaría un fallo de ese intento.
      expect(taken?.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
      const [done] = await db().select().from(outbox);
      expect(done?.attempts).toBe(1);
      expect(done?.processedAt).toBeInstanceOf(Date);
    });

    it("sigue en la lista de pendientes de /admin/sistema/jobs", async () => {
      const held = await holdInHandler("test.held");
      const pending = await listOutbox("pending");
      expect(pending.map((row) => row.eventType)).toEqual(["test.held"]);
      held.release();
      expect(await held.running).toBe("processed");
      expect(await listOutbox("pending")).toEqual([]);
      expect((await listOutbox("done")).map((row) => row.eventType)).toEqual(["test.held"]);
    });
  });

  describe("el proceso muere con el evento tomado", () => {
    const DAY = 24 * 60 * 60_000;

    // Una conexión prestada del pool no tiene quién oiga su `error` (el listener de `db/client.ts` es
    // de las inactivas, DT-238): sin este, la conexión que la prueba cierra tumba la corrida.
    const listening = new WeakSet<object>();
    const listen = (client: PoolClient) => {
      if (!listening.has(client)) {
        listening.add(client);
        client.on("error", () => {});
      }
    };
    beforeEach(() => void db().$client.on("acquire", listen));
    afterEach(() => void db().$client.off("acquire", listen));

    /**
     * Lo que le pasa a la fila cuando el proceso muere a mitad de un handler: PostgreSQL cierra la
     * conexión del poller y deshace la transacción que tenía abierta.
     */
    async function killPollerConnection(): Promise<void> {
      const found = await db().execute<{ pid: number }>(sql`
        select pid from pg_stat_activity
        where datname = current_database() and pid <> pg_backend_pid()
          and state = 'idle in transaction' and query ilike '%outbox%for update%'
      `);
      expect(found.rows).toHaveLength(1);
      await db().execute(sql`select pg_terminate_backend(${found.rows[0]?.pid ?? 0}, 5000)`);
    }

    it("el intento queda contado, no vuelve de primera y, gastados los cinco, va a dead letter sin correr otra vez", async () => {
      let runs = 0;
      registerHandler("test.crash", async () => {
        runs += 1;
        await killPollerConnection();
      });
      await enqueueEvent(db(), { type: "test.crash", payload: {} });
      const start = new Date();
      await expect(processOne(start)).rejects.toThrow();
      let [row] = await db().select().from(outbox);
      expect(row?.attempts).toBe(1);
      expect(row?.processedAt).toBeNull();
      expect(row?.deadLetterAt).toBeNull();
      // Espera lo mismo que un intento fallido: el arranque siguiente no lo encuentra de primero.
      expect((row?.nextAttemptAt.getTime() ?? 0) - start.getTime()).toBe(60_000);
      expect(await processOne(start)).toBe("idle");
      expect(runs).toBe(1);

      for (let i = 1; i < 5; i += 1) {
        await expect(processOne(new Date(start.getTime() + DAY * i))).rejects.toThrow();
      }
      [row] = await db().select().from(outbox);
      expect(row?.attempts).toBe(5);
      expect(row?.deadLetterAt).toBeNull();
      expect(runs).toBe(5);

      expect(await processOne(new Date(start.getTime() + DAY * 5))).toBe("failed");
      [row] = await db().select().from(outbox);
      expect(row?.deadLetterAt).toBeInstanceOf(Date);
      expect(row?.attempts).toBe(5);
      expect(row?.lastError).toContain("sin terminar");
      expect(runs).toBe(5);
      expect((await listOutbox("dead")).map((dead) => dead.id)).toEqual([row?.id]);
    });
  });

  it("el scheduler encola una sola vez por minuto aunque se dispare dos veces", async () => {
    const entry = { name: "prueba", cron: "* * * * *", events: ["a.uno", "b.dos"] };
    const at = new Date("2026-09-03T08:00:10Z");
    expect(await enqueueScheduled(entry, at)).toBe(2);
    await enqueueScheduled(entry, new Date("2026-09-03T08:00:40Z"));
    const [rows] = await db().select({ n: count() }).from(outbox);
    expect(rows?.n).toBe(2);
    expect(await enqueueScheduled(entry, new Date("2026-09-03T08:01:00Z"))).toBe(2);
    const [afterRows] = await db().select({ n: count() }).from(outbox);
    expect(afterRows?.n).toBe(4);
  });

  it("la depuración diaria encola la de identidad, la de personas y la del sistema", async () => {
    const { SCHEDULE } = await import("@/jobs/schedule");
    expect(SCHEDULE.find((entry) => entry.name === "prune")?.events).toEqual([
      "identity.prune",
      "people.prune",
      "system.prune",
    ]);
  });

  it("los handlers de los módulos quedan registrados al cargar handlers.ts", async () => {
    resetHandlersForTests();
    await import("@/jobs/handlers");
    for (const type of [
      "identity.prune",
      "people.prune",
      "system.prune",
      "system.backup-check",
      "media.process",
    ]) {
      expect(getHandlers(type).length, type).toBeGreaterThan(0);
    }
  });
});
