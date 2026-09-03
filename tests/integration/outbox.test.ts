import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain, processOne } from "@/jobs/poller";
import { getHandler, registerHandler, resetHandlersForTests } from "@/jobs/registry";
import { enqueueScheduled } from "@/jobs/scheduler";
import { retryDeadLetter } from "@/modules/system/domain/outbox";
import { auditLog, outbox } from "@/modules/system/schema";
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
    expect(row?.deadLetterAt).not.toBeNull();

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

  it("un evento sin handler falla en lugar de perderse", async () => {
    await enqueueEvent(db(), { type: "nadie.lo.atiende", payload: {} });
    expect(await processOne()).toBe("failed");
    const [row] = await db().select().from(outbox);
    expect(row?.lastError).toContain("Sin handler");
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

  it("los handlers de los módulos quedan registrados al cargar handlers.ts", async () => {
    resetHandlersForTests();
    await import("@/jobs/handlers");
    for (const type of ["identity.prune", "system.prune", "system.backup-check"]) {
      expect(getHandler(type), type).toBeTypeOf("function");
    }
  });
});
