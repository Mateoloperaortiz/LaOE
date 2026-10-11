import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { listOutbox, retryDeadLetterAs } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { seedPerson } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// El reintento que ofrece la pantalla de jobs del admin, por el comando público de `system`. El evento
// `prueba.reintento` no es del catálogo: su handler se registra acá, encima de los de los módulos.

const DAY = 24 * 60 * 60_000;
const FLAKY = "prueba.reintento";
const MAX_ATTEMPTS = 5;
// La clave de deduplicación de un trabajo que se repite, como el recompute de una ocasión.
const KEY = "prueba:reintento";

let fails = true;
let handled = 0;

/** Un evento que agotó sus intentos: cada drenado lo encuentra vencido y vuelve a fallar. */
async function seedDeadLetter(dedupeKey?: string): Promise<string> {
  await enqueueEvent(getDb(), {
    type: FLAKY,
    payload: {},
    ...(dedupeKey === undefined ? {} : { dedupeKey }),
  });
  const start = Date.now();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const now = new Date(start + attempt * DAY);
    expect((await drainOutbox({ now, expectFailures: [FLAKY] })).failed).toBe(1);
  }
  const [dead] = await listOutbox("dead");
  if (!dead) throw new Error("el evento no llegó a dead letter");
  return dead.id;
}

/** Lo que cada reintento dejó en la auditoría. La auditoría no tiene lectura pública en `system`. */
async function retryAudits() {
  return getDb()
    .select({
      actorId: auditLog.actorId,
      ip: auditLog.ip,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .where(eq(auditLog.action, "outbox.retried"));
}

/**
 * Otra transacción encola el mismo trabajo y todavía no confirma: ocupa la clave, y nadie más ve ese
 * evento hasta que se suelte.
 */
async function holdEnqueue(
  dedupeKey: string,
): Promise<{ pid: number; release: () => Promise<void> }> {
  let ready: (pid: number) => void = () => {};
  let release: () => void = () => {};
  const taken = new Promise<number>((resolve) => {
    ready = resolve;
  });
  const freed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = getDb().transaction(async (tx) => {
    await enqueueEvent(tx, { type: FLAKY, payload: {}, dedupeKey });
    const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready(result.rows[0]?.pid ?? 0);
    await freed;
  });
  return {
    pid: await taken,
    release: async () => {
      release();
      await done;
    },
  };
}

/** Evidencia de PostgreSQL de quién espera detrás de una transacción: se espera un hecho, no un tiempo. */
async function blockedBy(pid: number): Promise<number[]> {
  const result = await getDb().execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows.map((found) => found.pid);
}

describe("reintento de un evento en dead letter", () => {
  beforeAll(() => {
    registerHandler(FLAKY, async () => {
      if (fails) {
        throw new Error("no hoy");
      }
      handled += 1;
    });
  });
  beforeEach(async () => {
    await truncateAll();
    fails = true;
    handled = 0;
  });
  afterAll(() => closeDb());

  it("vuelve a la cola sin intentos ni error, y el siguiente drenado lo procesa", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter();
    expect(await listOutbox("dead")).toMatchObject([
      { id, attempts: MAX_ATTEMPTS, lastError: "no hoy" },
    ]);

    expect(await retryDeadLetterAs({ personId: admin, ip: "203.0.113.7" }, id)).toBe(true);

    expect(await listOutbox("dead")).toEqual([]);
    expect(await listOutbox("pending")).toMatchObject([{ id, attempts: 0, lastError: null }]);
    fails = false;
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    expect(handled).toBe(1);
    expect(await listOutbox("done")).toMatchObject([{ id }]);
  });

  it("queda auditado con quien lo reintentó y desde qué IP", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter();

    await retryDeadLetterAs({ personId: admin, ip: "203.0.113.7" }, id);

    // La auditoría no tiene lectura pública en `system`: se mira su tabla.
    const entries = await getDb()
      .select({ actorId: auditLog.actorId, ip: auditLog.ip, entityId: auditLog.entityId })
      .from(auditLog)
      .where(eq(auditLog.action, "outbox.retried"));
    expect(entries).toEqual([{ actorId: admin, ip: "203.0.113.7", entityId: id }]);
  });

  it("un evento que no está en dead letter, o que no existe, se deja como está", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    await enqueueEvent(getDb(), { type: FLAKY, payload: {} });
    const [pending] = await listOutbox("pending");
    const actor = { personId: admin, ip: null };

    expect(await retryDeadLetterAs(actor, pending?.id ?? "")).toBe(false);
    expect(await retryDeadLetterAs(actor, "no-existe")).toBe(false);

    expect(await listOutbox("pending")).toEqual([pending]);
  });

  it("con otro evento pendiente de la misma clave no falla: queda atendido y el pendiente, como estaba", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter(KEY);
    // Después del dead letter otro comando encola el mismo trabajo: la clave estaba libre y entra.
    await enqueueEvent(getDb(), { type: FLAKY, payload: {}, dedupeKey: KEY });
    const pending = await listOutbox("pending");
    expect(pending).toMatchObject([{ dedupeKey: KEY, attempts: 0 }]);

    expect(await retryDeadLetterAs({ personId: admin, ip: "203.0.113.7" }, id)).toBe(true);

    expect(await listOutbox("dead")).toEqual([]);
    expect(await listOutbox("pending")).toEqual(pending);
    // Sale de dead letter sin correr: conserva sus intentos y ya no cuenta como fallo.
    expect(await listOutbox("done")).toMatchObject([
      { id, attempts: MAX_ATTEMPTS, lastError: null, processedAt: expect.any(Date) },
    ]);
    // El trabajo se hace una sola vez, y lo hace el pendiente.
    fails = false;
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    expect(handled).toBe(1);
  });

  it("darlo por atendido se audita como reintento y nombra el pendiente que hace el trabajo", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter(KEY);
    await enqueueEvent(getDb(), { type: FLAKY, payload: {}, dedupeKey: KEY });
    const [pending] = await listOutbox("pending");

    await retryDeadLetterAs({ personId: admin, ip: "203.0.113.7" }, id);

    expect(await retryAudits()).toEqual([
      {
        actorId: admin,
        ip: "203.0.113.7",
        entityId: id,
        before: { attempts: MAX_ATTEMPTS, lastError: "no hoy" },
        after: { supersededBy: pending?.id },
      },
    ]);
  });

  it("con clave y sin otro pendiente vuelve a la cola, aunque uno igual ya se haya procesado", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter(KEY);
    // Un evento con la misma clave que ya se procesó no la ocupa.
    await enqueueEvent(getDb(), { type: FLAKY, payload: {}, dedupeKey: KEY });
    fails = false;
    expect(await drainOutbox({ expectFailures: [FLAKY] })).toEqual({ processed: 1, failed: 0 });

    expect(await retryDeadLetterAs({ personId: admin, ip: null }, id)).toBe(true);

    expect(await listOutbox("dead")).toEqual([]);
    expect(await listOutbox("pending")).toMatchObject([
      { id, dedupeKey: KEY, attempts: 0, lastError: null },
    ]);
    expect((await retryAudits()).map((entry) => entry.after)).toEqual([{ attempts: 0 }]);
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    expect(handled).toBe(2);
  });

  it("si el mismo trabajo se encola mientras corre el reintento, tampoco falla: queda atendido", async () => {
    const admin = await seedPerson("jobs.admin@eafit.edu.co");
    const id = await seedDeadLetter(KEY);
    const held = await holdEnqueue(KEY);
    const retrying = retryDeadLetterAs({ personId: admin, ip: null }, id).then(
      (retried) => ({ retried }),
      (error: unknown) => ({ error }),
    );
    try {
      // El reintento espera detrás de quien ocupa la clave: todavía no se sabe si ese evento queda.
      await expect.poll(async () => blockedBy(held.pid), { timeout: 10_000 }).toHaveLength(1);
    } finally {
      await held.release();
    }

    expect(await retrying).toEqual({ retried: true });

    const pending = await listOutbox("pending");
    expect(pending).toMatchObject([{ dedupeKey: KEY, attempts: 0 }]);
    expect(pending[0]?.id).not.toBe(id);
    expect(await listOutbox("dead")).toEqual([]);
    expect(await listOutbox("done")).toMatchObject([{ id, lastError: null }]);
    expect((await retryAudits()).map((entry) => entry.after)).toEqual([
      { supersededBy: pending[0]?.id },
    ]);
  });
});
