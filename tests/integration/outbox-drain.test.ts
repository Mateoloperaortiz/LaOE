import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { getHandlers, registerHandler } from "@/jobs/registry";
import { outbox } from "@/modules/system/schema";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// El drenado de las pruebas contra el poller real. Los eventos `prueba.*` no son del catálogo: sus
// handlers se registran acá, encima de los de los módulos.

const MINUTE = 60_000;
const PARENT = "prueba.padre";
const CHILD = "prueba.hijo";
const GRANDCHILD = "prueba.nieto";
const FRAGILE = "prueba.fragil";
const SWEEPER = "prueba.barre";
const ENDLESS = "prueba.eterno";

let seen: string[] = [];
let fragileFails = false;

const enqueue = (type: string, at?: Date) => enqueueEvent(getDb(), { type, payload: {} }, at);

describe("drenado del outbox para pruebas", () => {
  beforeAll(() => {
    registerHandler(PARENT, async () => {
      seen.push(PARENT);
      await enqueue(CHILD);
    });
    registerHandler(CHILD, async () => {
      seen.push(CHILD);
      await enqueue(GRANDCHILD);
    });
    registerHandler(GRANDCHILD, async () => {
      seen.push(GRANDCHILD);
    });
    registerHandler(FRAGILE, async () => {
      if (fragileFails) {
        throw new Error("no hoy");
      }
      seen.push(FRAGILE);
    });
    // Se lleva la fila del frágil, como una limpieza que corre después del fallo. El outbox no tiene
    // un borrado público: se va a su tabla.
    registerHandler(SWEEPER, async () => {
      await getDb().delete(outbox).where(eq(outbox.eventType, FRAGILE));
    });
    registerHandler(ENDLESS, async () => {
      seen.push(ENDLESS);
      await enqueue(ENDLESS);
    });
  });
  beforeEach(async () => {
    await truncateAll();
    seen = [];
    fragileFails = false;
  });
  afterAll(() => closeDb());

  it("un evento cuyo handler encola otro llega al reposo con una sola llamada", async () => {
    await enqueue(PARENT);
    expect(await drainOutbox()).toEqual({ processed: 3, failed: 0 });
    expect(seen).toEqual([PARENT, CHILD, GRANDCHILD]);
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
  });

  it("un handler que falla hace fallar la llamada, que nombra el evento y su error", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await expect(drainOutbox()).rejects.toThrow(/prueba\.fragil.*no hoy/);
  });

  it("el fallo no corta el drenado: el resto de la cola llega al reposo antes de denunciarlo", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await enqueue(PARENT);
    await expect(drainOutbox()).rejects.toThrow(/prueba\.fragil/);
    expect(seen).toEqual([PARENT, CHILD, GRANDCHILD]);
  });

  it("un fallo de la llamada la rompe aunque su fila ya no esté al terminar", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await enqueue(SWEEPER);
    await expect(drainOutbox()).rejects.toThrow(/Falló el outbox \(1 en esta llamada\)/);
  });

  it("un handler que se reencola sin fin no cuelga el drenado: la llamada falla y dice que no hubo reposo", async () => {
    await enqueue(ENDLESS);
    await expect(drainOutbox()).rejects.toThrow(/no llegó al reposo/);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("un fallo que la prueba declara no rompe la llamada", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await enqueue(PARENT);
    expect(await drainOutbox({ expectFailures: [FRAGILE] })).toEqual({ processed: 3, failed: 1 });
  });

  it("declarar un fallo no tapa el de otro evento", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await expect(drainOutbox({ expectFailures: [PARENT] })).rejects.toThrow(
      /prueba\.fragil.*no hoy/,
    );
  });

  it("declarar un fallo que no ocurre rompe la llamada", async () => {
    await enqueue(FRAGILE);
    await expect(drainOutbox({ expectFailures: [FRAGILE] })).rejects.toThrow(/prueba\.fragil/);
    expect(seen).toEqual([FRAGILE]);
  });

  it("un trabajo que falló antes y espera su reintento sigue rompiendo la llamada", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await drainOutbox({ expectFailures: [FRAGILE] });
    await expect(drainOutbox()).rejects.toThrow(/prueba\.fragil.*no hoy/);
  });

  it("el reintento de un fallo no se adelanta solo: corre cuando la prueba adelanta el reloj", async () => {
    fragileFails = true;
    await enqueue(FRAGILE);
    await drainOutbox({ expectFailures: [FRAGILE] });
    fragileFails = false;
    expect(await drainOutbox({ expectFailures: [FRAGILE] })).toEqual({ processed: 0, failed: 0 });
    expect(await drainOutbox({ now: new Date(Date.now() + 2 * MINUTE) })).toEqual({
      processed: 1,
      failed: 0,
    });
    expect(seen).toEqual([FRAGILE]);
  });

  it("un evento agendado espera su hora; con el reloj adelantado corre con sus hijos", async () => {
    const later = new Date(Date.now() + 60 * MINUTE);
    await enqueue(PARENT, later);
    expect(await drainOutbox()).toEqual({ processed: 0, failed: 0 });
    expect(seen).toEqual([]);
    expect(await drainOutbox({ now: later })).toEqual({ processed: 3, failed: 0 });
    expect(seen).toEqual([PARENT, CHILD, GRANDCHILD]);
  });

  it("importar el drenado registra los handlers de los módulos", () => {
    for (const type of ["identity.prune", "system.prune", "media.process"]) {
      expect(getHandlers(type).length, type).toBeGreaterThan(0);
    }
  });
});
