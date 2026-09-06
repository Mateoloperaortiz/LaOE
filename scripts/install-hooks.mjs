import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Railpack recibe un contexto sin .git. Los hooks solo se instalan en checkouts locales;
// .git puede ser un archivo (worktree) o un directorio. CI ejecuta sus checks directamente.
const ci = process.env.CI && process.env.CI !== "0" && process.env.CI !== "false";
if (!ci && existsSync(".git")) {
  const executable = fileURLToPath(
    new URL("../node_modules/lefthook/bin/index.js", import.meta.url),
  );
  const result = spawnSync(process.execPath, [executable, "install"], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write("No se pudo iniciar la instalación de Git hooks\n");
  }
  process.exitCode = result.status ?? 1;
}
