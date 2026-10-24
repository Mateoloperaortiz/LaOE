import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { integrationWorkers } from "./tests/integration/test-database";

const src = fileURLToPath(new URL("./src", import.meta.url));

// Integración corre archivos en paralelo, una base por ranura (tests/integration/test-database.ts).
const workers = integrationWorkers();

export default defineConfig({
  resolve: { alias: { "@": src } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/server-only.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/server-only.ts", "tests/integration/setup.ts"],
          fileParallelism: workers > 1,
          maxWorkers: workers,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
