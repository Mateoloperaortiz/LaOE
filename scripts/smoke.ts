import { parseSmokeOptions, runSmoke } from "./lib/smoke.ts";

// No cargar .env ni getEnv: las expectativas salen de la release, no del servidor comprobado.
try {
  const results = await runSmoke(parseSmokeOptions(process.argv.slice(2)));
  for (const result of results) {
    process.stdout.write(
      `${result.ok ? "OK" : "ERROR"} · ${result.check}${result.error ? `: ${result.error}` : ""}\n`,
    );
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
