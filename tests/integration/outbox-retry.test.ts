import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { listOutbox, retryDeadLetterAs } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedPerson } from "./factories";

// El reintento que ofrece la pantalla de jobs del admin, por el comando público de `system`. El evento
// `prueba.reintento` no es del catálogo: su handler se registra acá, encima de los de los módulos.

const DAY = 24 * 60 * 60_000;
const FLAKY = "prueba.reintento";
const MAX_ATTEMPTS = 5;

let fails = true;
let handled = 0;

/** Un evento que agotó sus intentos: cada drenado lo encuentra vencido y vuelve a fallar. */
async function seedDeadLetter(): Promise<string> {
  await enqueueEvent(getDb(), { type: FLAKY, payload: {} });
  const start = Date.now();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const now = new Date(start + attempt * DAY);
    expect((await drainOutbox({ now, expectFailures: [FLAKY] })).failed).toBe(1);
  }
  const [dead] = await listOutbox("dead");
  if (!dead) throw new Error("el evento no llegó a dead letter");
  return dead.id;
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
});
