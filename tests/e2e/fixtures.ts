import { appendFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { test as base, type TestInfo } from "@playwright/test";
import { closeDb } from "@/db/client";
import { restoreBaseline } from "./database";
import { drenarOutbox } from "./outbox";

/**
 * Una línea por restauración en `test-results/restore-baseline.jsonl`: con ella se ve si la
 * preparación de alguna prueba se quedó esperando a Postgres (DT-111).
 */
function logRestore(testInfo: TestInfo, startedAt: Date, ms: number): void {
  mkdirSync(testInfo.project.outputDir, { recursive: true });
  appendFileSync(
    join(testInfo.project.outputDir, "restore-baseline.jsonl"),
    `${JSON.stringify({
      at: startedAt.toISOString(),
      ms: Math.round(ms),
      test: `${basename(testInfo.file)}:${testInfo.line}`,
    })}\n`,
  );
}

/** Antes de los beforeEach del spec, también cuando se filtra un caso o se reintenta. */
export const test = base.extend<{ isolatedData: undefined }>({
  isolatedData: [
    async ({ browser }, use, testInfo) => {
      if (testInfo.config.workers !== 1)
        throw new Error("La base E2E por escenario requiere --workers=1");
      const startedAt = new Date();
      const started = performance.now();
      await restoreBaseline();
      logRestore(testInfo, startedAt, performance.now() - started);
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
