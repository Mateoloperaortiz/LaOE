import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { requireConfig } from "@/modules/system";
import { appConfig } from "@/modules/system/schema";
import { drenarOutbox } from "../e2e/outbox";
import { truncateAll } from "./db";

beforeEach(() => truncateAll());
afterAll(() => closeDb());

it("el drenado E2E ve la configuración que cambió el servidor aunque el runner la tenga en caché", async () => {
  expect(await requireConfig("gamification.enabled")).toBe(false);
  // Como una acción del servidor: escribe en la base sin invalidar la memoria de Playwright.
  await getDb()
    .update(appConfig)
    .set({ value: true })
    .where(eq(appConfig.key, "gamification.enabled"));

  const observed: boolean[] = [];
  const eventType = "prueba.config-externa";
  registerHandler(eventType, async () => {
    observed.push(await requireConfig("gamification.enabled"));
  });
  await enqueueEvent(getDb(), { type: eventType, payload: {} });

  await drenarOutbox();

  expect(observed).toEqual([true]);
});
