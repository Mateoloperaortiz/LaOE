import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("logs de procesos sin terminal", () => {
  it.each([
    { name: "CI", NODE_ENV: "development", CI: "true" },
    { name: "script redirigido", NODE_ENV: "development", CI: "" },
    { name: "producción", NODE_ENV: "production", CI: "" },
  ] as const)("$name escribe JSON redactado y termina sin forzar process.exit", (environment) => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import { logger } from "./src/shared/log.ts";
         logger.info({ account: { password: "clave-sintetica", token: "token-sintetico" } }, "fin del script");`,
      ],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: environment.NODE_ENV, CI: environment.CI },
        encoding: "utf8",
        timeout: 4_000,
        killSignal: "SIGKILL",
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      level: 30,
      msg: "fin del script",
      account: { password: "[oculto]", token: "[oculto]" },
    });
    expect(result.stdout).not.toContain("sintetic");
  });
});
