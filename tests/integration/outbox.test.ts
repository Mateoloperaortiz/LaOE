import { asc, count, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { type CommandContext, enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { BACKOFF_MS } from "@/jobs/backoff";
import { drain, processOne, restoreTakenKeys, startPoller } from "@/jobs/poller";
import { getHandlers, registerHandler, resetHandlersForTests } from "@/jobs/registry";
import { enqueueScheduled } from "@/jobs/scheduler";
import { listOutbox, retryDeadLetter } from "@/modules/system/domain/outbox";
import { auditLog, outbox } from "@/modules/system/schema";
import { backendPid, deferred, holdCommand, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";

const db = () => getDb();

/** Un reloj quieto en el instante dado: el poller recibe su reloj como función (ADR-118 regla 2). */
const at = (instant: Date) => () => instant;

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
    expect(await processOne(at(now), 50)).toBe("failed");
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
    expect(await processOne(at(now))).toBe("failed");
    let [row] = await db().select().from(outbox);
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("no hoy");
    expect(row?.deadLetterAt).toBeNull();
    expect((row?.nextAttemptAt.getTime() ?? 0) - now.getTime()).toBe(60_000);
    expect(await processOne(at(now))).toBe("idle"); // todavía no toca

    for (let i = 0; i < 4; i += 1) {
      const later = new Date(now.getTime() + 24 * 60 * 60_000 * (i + 1));
      expect(await processOne(at(later))).toBe("failed");
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

  describe("la espera del reintento", () => {
    const START = new Date("2026-10-08T15:00:00Z");
    const TEN_MINUTES = 600_000;
    const event = (type: string, msBefore = 0) =>
      enqueueEvent(db(), { type, payload: {} }, new Date(START.getTime() - msBefore));

    it("se cuenta desde el fallo, no desde que se tomó el evento", async () => {
      // El reloj avanza mientras corre el handler: lo que tarda en vencer su límite (ADR-079).
      let current = START;
      registerHandler("test.fail", async () => {
        current = new Date(START.getTime() + TEN_MINUTES);
        throw new Error("no hoy");
      });
      await event("test.fail");
      expect(await processOne(() => current)).toBe("failed");
      const [row] = await db().select().from(outbox);
      expect((row?.nextAttemptAt.getTime() ?? 0) - START.getTime()).toBe(TEN_MINUTES + 60_000);
      // El tick que sigue al fallo todavía no lo encuentra.
      expect(await processOne(() => current)).toBe("idle");
    });

    it("en un lote, el que falla detrás de uno lento espera su minuto, y lo que encola un handler espera al lote siguiente", async () => {
      let current = START;
      let chained = 0;
      registerHandler("test.slow", async () => {
        current = new Date(START.getTime() + TEN_MINUTES);
        await enqueueEvent(db(), { type: "test.chained", payload: {} }, current);
      });
      registerHandler("test.fail", async () => {
        throw new Error("no hoy");
      });
      registerHandler("test.chained", async () => {
        chained += 1;
      });
      await event("test.slow", 2);
      await event("test.fail", 1);

      expect(await drain(50, () => current)).toEqual({ processed: 1, failed: 1 });
      const rows = await db().select().from(outbox);
      const byType = new Map(rows.map((row) => [row.eventType, row]));
      expect(byType.get("test.slow")?.processedAt?.getTime()).toBe(START.getTime() + TEN_MINUTES);
      expect((byType.get("test.fail")?.nextAttemptAt.getTime() ?? 0) - START.getTime()).toBe(
        TEN_MINUTES + 60_000,
      );
      expect(chained).toBe(0);

      // El lote siguiente arranca donde terminó este: corre lo encadenado y no reintenta el fallo.
      expect(await drain(50, () => current)).toEqual({ processed: 1, failed: 0 });
      expect(chained).toBe(1);
    });
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
      expect(await processOne(at(now))).toBe("failed");
      await emit();
      const rows = await db().select().from(outbox);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.dedupeKey).toBe(KEY);

      fail = false;
      expect(await processOne(at(new Date(now.getTime() + 60_000)))).toBe("processed");
      expect(runs).toBe(2);
    });
  });

  describe("un emit con su clave mientras el evento está en curso", () => {
    const KEY = "prueba:recalculo";
    const TYPE = "test.recompute";
    const DAY = 24 * 60 * 60_000;

    /** El estado que lee el handler: cuántos cambios hay confirmados. */
    async function changes(): Promise<number> {
      const [row] = await db()
        .select({ n: count() })
        .from(auditLog)
        .where(eq(auditLog.action, "test.changed"));
      return row?.n ?? 0;
    }

    /** Un comando como los de la casa: cambia el estado y emite el recálculo con su clave. */
    const change = (ctx: CommandContext) =>
      ctx
        .audit({ action: "test.changed", entityType: "test", entityId: "1" })
        .then(() => ctx.emit({ type: TYPE, payload: {}, dedupeKey: KEY }));

    /** Deja al poller detenido en el handler, que ya leyó el estado; `fail` lo hace fallar al soltarlo. */
    async function holdAfterReading(options: { fail?: boolean } = {}) {
      const seen: number[] = [];
      const started = deferred<void>();
      const gate = deferred<void>();
      registerHandler(TYPE, async () => {
        seen.push(await changes());
        if (seen.length === 1) {
          started.resolve();
          await gate.promise;
          if (options.fail) {
            throw new Error("no hoy");
          }
        }
      });
      await runCommand(SYSTEM_ACTOR, change);
      const running = processOne();
      await started.promise;
      return { seen, running, release: () => gate.resolve() };
    }

    const rowsByAge = () => db().select().from(outbox).orderBy(asc(outbox.createdAt));

    it("no se pierde: entra como evento nuevo y se procesa después del que estaba en curso", async () => {
      const held = await holdAfterReading();
      // El segundo cambio llega cuando el handler ya leyó el primero.
      await runCommand(SYSTEM_ACTOR, change);
      await runCommand(SYSTEM_ACTOR, change);
      held.release();
      expect(await held.running).toBe("processed");
      // Los dos emits que llegaron en curso dejaron un solo evento nuevo: sin tomar, la clave deduplica.
      expect(await drain(50)).toEqual({ processed: 1, failed: 0 });
      expect(held.seen).toEqual([1, 3]);
      expect((await rowsByAge()).map((row) => row.dedupeKey)).toEqual([KEY, KEY]);
    });

    it("si el que estaba en curso falla, reintenta por su cuenta y sin la clave, que ya es del nuevo", async () => {
      const held = await holdAfterReading({ fail: true });
      await runCommand(SYSTEM_ACTOR, change);
      held.release();
      expect(await held.running).toBe("failed");
      let [first, second] = await rowsByAge();
      expect(first?.lastError).toBe("no hoy");
      // Sin clave en la cola, y con la suya guardada para el intento siguiente.
      expect([first?.dedupeKey, first?.takenDedupeKey]).toEqual([null, KEY]);
      expect(second?.dedupeKey).toBe(KEY);

      expect(await drain(50)).toEqual({ processed: 1, failed: 0 });
      expect(await processOne(at(new Date(Date.now() + DAY)))).toBe("processed");
      expect(held.seen).toEqual([1, 2, 2]);
      [first, second] = await rowsByAge();
      expect(first?.processedAt).toBeInstanceOf(Date);
      expect(second?.processedAt).toBeInstanceOf(Date);
      // El reintento la tomó sin clave y al terminar la recuperó de la guardada: las dos quedan con la
      // suya, que es lo que muestra /admin/sistema/jobs, y sin nada guardado.
      expect([first?.dedupeKey, first?.takenDedupeKey]).toEqual([KEY, null]);
      expect([second?.dedupeKey, second?.takenDedupeKey]).toEqual([KEY, null]);
    });

    it("si falla mientras otro comando todavía no confirma su emit, la clave la decide el índice", async () => {
      const held = await holdAfterReading({ fail: true });
      const command = await holdCommand(SYSTEM_ACTOR, change);
      held.release();
      try {
        // El fallo quiere devolverle la clave a su fila y hace cola detrás del emit sin confirmar.
        await expect.poll(() => waitingOn(command.pid)).toBe(1);
      } finally {
        command.release();
        await command.done;
      }
      expect(await held.running).toBe("failed");
      const [first, second] = await rowsByAge();
      expect(first?.lastError).toBe("no hoy");
      expect(first?.dedupeKey).toBeNull();
      expect(second?.dedupeKey).toBe(KEY);
    });

    it("un evento con clave que agota sus intentos queda en dead letter con su clave", async () => {
      registerHandler(TYPE, async () => {
        throw new Error("no hoy");
      });
      await runCommand(SYSTEM_ACTOR, change);
      const start = new Date();
      for (let i = 0; i < 5; i += 1) {
        expect(await processOne(at(new Date(start.getTime() + DAY * i)))).toBe("failed");
      }
      const [row] = await db().select().from(outbox);
      expect(row?.deadLetterAt).toBeInstanceOf(Date);
      expect(row?.dedupeKey).toBe(KEY);
    });

    it("al arrancar, el que falló con su clave ocupada queda atendido por el pendiente que la ocupa, que se queda con el mayor de los dos intentos y la espera más tardía", async () => {
      const start = new Date("2026-10-08T15:00:00Z");
      const minutes = (n: number) => new Date(start.getTime() + n * 60_000);
      const emit = () => enqueueEvent(db(), { type: TYPE, payload: {}, dedupeKey: KEY }, start);
      let current = start;
      let runs = 0;
      registerHandler(TYPE, async () => {
        runs += 1;
        if (runs === 1) {
          // Con el primero en curso llega un emit de su clave; el primero tarda diez minutos y falla.
          await emit();
          current = minutes(10);
        }
        throw new Error("no hoy");
      });
      await emit();
      expect(await processOne(() => current)).toBe("failed");
      // El nuevo falla dos veces por su cuenta, y cada vez recupera la clave.
      expect(await processOne(at(start))).toBe("failed");
      expect(await processOne(at(minutes(1)))).toBe("failed");
      let [first, second] = await rowsByAge();
      expect([first?.dedupeKey, first?.takenDedupeKey, first?.attempts]).toEqual([null, KEY, 1]);
      expect([second?.dedupeKey, second?.takenDedupeKey, second?.attempts]).toEqual([KEY, null, 2]);

      // El proceso arranca (un despliegue): quedan en uno solo, que hace el trabajo de los dos.
      const booted = await restoreTakenKeys(at(minutes(2)));
      [first, second] = await rowsByAge();
      expect([first?.dedupeKey, first?.takenDedupeKey, first?.attempts, first?.lastError]).toEqual([
        KEY,
        null,
        1,
        null,
      ]);
      expect(first?.processedAt).toEqual(minutes(2));
      // Dos intentos son los suyos; la espera es la del primero, que falló más tarde (minuto 10 más 1).
      expect([second?.dedupeKey, second?.attempts, second?.nextAttemptAt]).toEqual([
        KEY,
        2,
        minutes(11),
      ]);
      expect(second?.processedAt).toBeNull();
      expect(booted).toEqual({ restored: 0, superseded: 1 });
      expect(await processOne(at(minutes(10)))).toBe("idle");
      expect(runs).toBe(3);
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
      expect(await processOne(at(tomorrow))).toBe("idle");
      held.release();
      expect(await held.running).toBe("processed");
      expect(await processOne(at(tomorrow))).toBe("idle");
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
      await expect(processOne(at(start))).rejects.toThrow();
      let [row] = await db().select().from(outbox);
      expect(row?.attempts).toBe(1);
      expect(row?.processedAt).toBeNull();
      expect(row?.deadLetterAt).toBeNull();
      // Espera lo mismo que un intento fallido: el arranque siguiente no lo encuentra de primero.
      expect((row?.nextAttemptAt.getTime() ?? 0) - start.getTime()).toBe(60_000);
      expect(await processOne(at(start))).toBe("idle");
      expect(runs).toBe(1);

      for (let i = 1; i < 5; i += 1) {
        await expect(processOne(at(new Date(start.getTime() + DAY * i)))).rejects.toThrow();
      }
      [row] = await db().select().from(outbox);
      expect(row?.attempts).toBe(5);
      expect(row?.deadLetterAt).toBeNull();
      expect(runs).toBe(5);

      expect(await processOne(at(new Date(start.getTime() + DAY * 5)))).toBe("failed");
      [row] = await db().select().from(outbox);
      expect(row?.deadLetterAt).toBeInstanceOf(Date);
      expect(row?.attempts).toBe(5);
      expect(row?.lastError).toContain("sin terminar");
      expect(runs).toBe(5);
      expect((await listOutbox("dead")).map((dead) => dead.id)).toEqual([row?.id]);
    });

    it("al arrancar no toca un evento que otro poller está corriendo: ni le devuelve la clave ni lo da por atendido", async () => {
      const KEY = "score:ocasion-en-curso";
      const emit = () => enqueueEvent(db(), { type: "test.held", payload: {}, dedupeKey: KEY });
      const started = deferred<void>();
      const gate = deferred<void>();
      registerHandler("test.held", async () => {
        started.resolve();
        await gate.promise;
      });
      await emit();
      const running = processOne();
      await started.promise;

      try {
        expect(await restoreTakenKeys()).toEqual({ restored: 0, superseded: 0 });
        // Sigue tomada: sin clave en la cola, con la suya guardada, y así la muestra
        // /admin/sistema/jobs.
        const [taken] = await listOutbox("pending");
        expect([taken?.dedupeKey, taken?.takenDedupeKey]).toEqual([null, KEY]);

        // Tampoco cuando otro pendiente ocupa su clave: la que corre tiene dueño y nadie hereda de
        // ella.
        await emit();
        expect(await restoreTakenKeys()).toEqual({ restored: 0, superseded: 0 });
        const [queued, stillTaken] = await listOutbox("pending");
        expect([queued?.dedupeKey, queued?.attempts]).toEqual([KEY, 0]);
        expect([stillTaken?.dedupeKey, stillTaken?.takenDedupeKey]).toEqual([null, KEY]);
      } finally {
        // Si algo de arriba falla, el handler detenido no deja colgadas las pruebas que siguen.
        gate.resolve();
      }
      expect(await running).toBe("processed");
      const [done] = await listOutbox("done");
      expect([done?.dedupeKey, done?.takenDedupeKey]).toEqual([KEY, null]);
    });

    it("un evento con clave la recupera al arrancar: el emit siguiente se descarta y el proceso no vuelve a caer por él", async () => {
      const KEY = "score:ocasion-sintetica";
      let runs = 0;
      registerHandler("test.crash", async () => {
        runs += 1;
        await killPollerConnection();
      });
      const emit = () => enqueueEvent(db(), { type: "test.crash", payload: {}, dedupeKey: KEY });
      await emit();
      const start = new Date();
      await expect(processOne(at(start))).rejects.toThrow();

      // El proceso vuelve a arrancar y, con actividad en curso, llega otro emit de la misma clave.
      await startPoller({ intervalMs: 3_600_000, batchSize: 1, handlerTimeoutMs: 0 }).stop();
      await emit();

      // No entró como evento nuevo, vencido y con cinco intentos propios: la fila que espera su
      // reintento volvió a ser el pendiente de su clave.
      let rows = await db().select().from(outbox);
      expect(rows.map((row) => [row.attempts, row.dedupeKey])).toEqual([[1, KEY]]);
      expect(await processOne(at(start))).toBe("idle");
      expect(runs).toBe(1);

      // Sigue su cuenta y, gastados los cinco, va a dead letter con su clave, que es lo que mira quien
      // la reintenta (ADR-113 regla 8).
      for (let i = 1; i < 5; i += 1) {
        await expect(processOne(at(new Date(start.getTime() + DAY * i)))).rejects.toThrow();
      }
      expect(await processOne(at(new Date(start.getTime() + DAY * 5)))).toBe("failed");
      rows = await db().select().from(outbox);
      expect(rows.map((row) => [row.attempts, row.dedupeKey, row.deadLetterAt !== null])).toEqual([
        [5, KEY, true],
      ]);
      expect(runs).toBe(5);
    });

    describe("y otro pendiente ya ocupa su clave", () => {
      const KEY = "score:ocasion-con-actividad";
      const START = new Date("2026-10-08T15:00:00Z");
      const after = (ms: number) => new Date(START.getTime() + ms);
      const emit = (now: Date) =>
        enqueueEvent(db(), { type: "test.crash", payload: {}, dedupeKey: KEY }, now);
      const rowsByAge = () => db().select().from(outbox).orderBy(asc(outbox.createdAt));

      it("con un emit de su clave en cada corrida, el evento que tumba el proceso corre cinco veces en total, con su espera, y deja un solo dead letter", async () => {
        let now = START;
        let runs = 0;
        registerHandler("test.crash", async () => {
          runs += 1;
          // Actividad en curso: el emit entra, porque la fila que corre ya no lleva la clave.
          await emit(now);
          await killPollerConnection();
        });
        await emit(now);
        /** Un arranque del proceso: devuelve las claves tomadas y entrega lo que esté vencido. */
        const boot = async () => {
          await restoreTakenKeys(() => now);
          return processOne(() => now).catch(() => "crashed" as const);
        };

        for (const [index, wait] of BACKOFF_MS.entries()) {
          expect(await boot()).toBe("crashed");
          // Arranca otra vez en el mismo instante. El emit que llegó en curso no es un evento nuevo,
          // vencido y con cinco intentos propios: sigue la cuenta y la espera del que murió.
          expect(await boot()).toBe("idle");
          const pending = await listOutbox("pending");
          expect(
            pending.map((row) => [
              row.dedupeKey,
              row.takenDedupeKey,
              row.attempts,
              row.nextAttemptAt.getTime() - now.getTime(),
            ]),
          ).toEqual([[KEY, null, index + 1, wait]]);
          now = new Date(now.getTime() + wait);
        }
        expect(runs).toBe(5);

        // La toma siguiente lo encuentra con los cinco intentos gastados: dead letter sin correr.
        expect(await boot()).toBe("failed");
        expect(runs).toBe(5);
        expect(await listOutbox("pending")).toEqual([]);
        const dead = await listOutbox("dead");
        expect(dead.map((row) => [row.dedupeKey, row.takenDedupeKey, row.attempts])).toEqual([
          [KEY, null, 5],
        ]);
        // Nunca corrió: los intentos son los que heredó, y su `lastError` lo dice.
        expect(dead[0]?.lastError).toContain("sin terminar");
        expect(dead[0]?.lastError).toContain("heredados de otro evento de su clave");
        // Los cinco que murieron quedaron atendidos por el que los heredó, con su clave y sin error.
        const done = await listOutbox("done");
        expect(done.map((row) => [row.dedupeKey, row.takenDedupeKey, row.lastError])).toEqual(
          BACKOFF_MS.map(() => [KEY, null, null]),
        );
        expect(await boot()).toBe("idle");
      });

      it("si muere una sola vez, el pendiente corre una vez, tras la espera del que murió, y lee lo que trajo su emit", async () => {
        let state = 1;
        const seen: number[] = [];
        registerHandler("test.crash", async () => {
          seen.push(state);
          if (seen.length === 1) {
            // Un cambio llega con el evento en curso y emite su clave; después el proceso muere.
            state = 2;
            await emit(START);
            await killPollerConnection();
          }
        });
        await emit(START);
        await expect(processOne(at(START))).rejects.toThrow();

        const booted = await restoreTakenKeys(at(START));
        expect(await processOne(at(START))).toBe("idle");
        expect(await processOne(at(after(59_999)))).toBe("idle");
        expect(booted).toEqual({ restored: 0, superseded: 1 });
        expect(await processOne(at(after(60_000)))).toBe("processed");
        expect(seen).toEqual([1, 2]);

        // El que murió no vuelve a correr: su trabajo lo hizo el que heredó, que leyó después.
        expect(await processOne(at(after(DAY)))).toBe("idle");
        expect(
          (await rowsByAge()).map((row) => [
            row.attempts,
            row.dedupeKey,
            row.takenDedupeKey,
            row.processedAt,
          ]),
        ).toEqual([
          [1, KEY, null, START],
          [2, KEY, null, after(60_000)],
        ]);
      });

      it("dos que murieron tomados con la misma clave quedan en uno: el más viejo la recupera y hereda del otro", async () => {
        let runs = 0;
        registerHandler("test.crash", async () => {
          runs += 1;
          if (runs === 1) {
            await emit(START);
          }
          await killPollerConnection();
        });
        await emit(START);
        // Mueren los dos antes de que ningún arranque alcance a devolver una clave.
        await expect(processOne(at(START))).rejects.toThrow();
        await expect(processOne(at(after(10_000)))).rejects.toThrow();
        expect((await rowsByAge()).map((row) => [row.dedupeKey, row.takenDedupeKey])).toEqual([
          [null, KEY],
          [null, KEY],
        ]);

        const booted = await restoreTakenKeys(at(after(20_000)));
        const [older, newer] = await rowsByAge();
        // La espera es la del segundo, que se tomó diez segundos después.
        expect([
          older?.dedupeKey,
          older?.takenDedupeKey,
          older?.attempts,
          older?.nextAttemptAt,
          older?.processedAt,
        ]).toEqual([KEY, null, 1, after(70_000), null]);
        expect([newer?.dedupeKey, newer?.takenDedupeKey, newer?.processedAt]).toEqual([
          KEY,
          null,
          after(20_000),
        ]);
        expect(booted).toEqual({ restored: 1, superseded: 1 });
        // Vuelve a haber un solo pendiente de la clave: el emit siguiente se descarta contra él.
        await emit(after(20_000));
        expect(await rowsByAge()).toHaveLength(2);
      });

      it("si el pendiente que ocupa la clave es de otro tipo de evento, no hereda: el que murió sigue por su cuenta y corren los dos", async () => {
        const ran: string[] = [];
        registerHandler("test.crash", async () => void ran.push("el que murió"));
        registerHandler("test.other", async () => void ran.push("el otro"));
        // La fila que quedó tomada cuando el proceso murió, y un pendiente de otro tipo con su clave.
        await db()
          .insert(outbox)
          .values({
            eventType: "test.crash",
            payload: {},
            attempts: 1,
            takenDedupeKey: KEY,
            nextAttemptAt: after(60_000),
            createdAt: START,
          });
        await enqueueEvent(db(), { type: "test.other", payload: {}, dedupeKey: KEY }, after(1_000));

        expect(await restoreTakenKeys(at(after(2_000)))).toEqual({ restored: 0, superseded: 0 });
        const [orphan, other] = await rowsByAge();
        expect([
          orphan?.dedupeKey,
          orphan?.takenDedupeKey,
          orphan?.attempts,
          orphan?.processedAt,
        ]).toEqual([null, KEY, 1, null]);
        expect([other?.dedupeKey, other?.attempts]).toEqual([KEY, 0]);

        await drain(10, at(after(DAY)));
        expect(ran.sort()).toEqual(["el otro", "el que murió"]);
      });

      it("si otro poller toma al que ocupa la clave justo cuando iba a heredar, el que murió recupera su clave y nadie queda atendido sin correr", async () => {
        let runs = 0;
        registerHandler("test.crash", async () => {
          runs += 1;
          if (runs === 1) {
            await emit(START);
            await killPollerConnection();
          }
        });
        await emit(START);
        await expect(processOne(at(START))).rejects.toThrow();
        const [, occupant] = await rowsByAge();
        const occupantId = occupant?.id ?? "";

        // La toma de otro poller, escrita a mano para detenerla entre su lectura y su escritura: la de
        // verdad (`take`) confirma sin pausa y no se deja detener desde afuera.
        const locked = deferred<number>();
        const queued = deferred<void>();
        const taking = db().transaction(async (tx) => {
          await tx.select().from(outbox).where(eq(outbox.id, occupantId)).for("update");
          locked.resolve(await backendPid(tx));
          await queued.promise;
          await tx
            .update(outbox)
            .set({ attempts: 1, dedupeKey: null, takenDedupeKey: KEY })
            .where(eq(outbox.id, occupantId));
        });
        void taking.catch(locked.reject);
        const pid = await locked.promise;
        const booting = restoreTakenKeys(at(START));
        try {
          // El índice rechazó la devolución y el arranque fue por el que ocupa la clave: hace cola
          // detrás de la toma.
          await expect.poll(() => waitingOn(pid)).toBe(1);
        } finally {
          queued.resolve();
          await taking;
        }

        // Cuando la toma confirma, el que ocupaba la clave ya no está en cola: no hay de quién heredar.
        expect(await booting).toEqual({ restored: 1, superseded: 0 });
        expect(
          (await rowsByAge()).map((row) => [
            row.dedupeKey,
            row.takenDedupeKey,
            row.attempts,
            row.processedAt,
          ]),
        ).toEqual([
          [KEY, null, 1, null],
          [null, KEY, 1, null],
        ]);
      });
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
