import { test as base } from "@playwright/test";
import { closeDb } from "@/db/client";
import { restoreBaseline } from "./database";
import { drenarOutbox } from "./outbox";

/** Antes de los beforeEach del spec, también cuando se filtra un caso o se reintenta. */
export const test = base.extend<{ isolatedData: undefined }>({
  isolatedData: [
    async ({ browser }, use, testInfo) => {
      if (testInfo.config.workers !== 1)
        throw new Error("La base E2E por escenario requiere --workers=1");
      await restoreBaseline();
      try {
        await use(undefined);
      } finally {
        for (const context of browser.contexts()) await context.close();
        try {
          await drenarOutbox();
          testInfo.annotations.push({ type: "outbox", description: "sin fallos" });
        } finally {
          await closeDb();
        }
      }
    },
    { auto: true },
  ],
});
