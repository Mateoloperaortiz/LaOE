import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyPaths, comparisonBase, verifyJobs } from "./policy.mjs";
import { verifyE2eReports, verifyVitestReport } from "./reports.mjs";
import { readSmokeDeployment } from "./smoke-context.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const output = (name, value) => {
  process.stdout.write(`${name}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

try {
  if (process.argv[2] === "classify") {
    const head = git("rev-parse", "HEAD");
    const event = process.env.GITHUB_EVENT_PATH ? readJson(process.env.GITHUB_EVENT_PATH) : {};
    const base = comparisonBase(process.env.GITHUB_EVENT_NAME, event, head);
    let paths = null;
    if (base) {
      try {
        paths = git("diff", "--name-only", "--no-renames", "-z", base, head)
          .split("\0")
          .filter(Boolean);
      } catch {
        process.stdout.write("No se pudo obtener el diff completo: se ejecuta toda la suite.\n");
      }
    }
    const mode = classifyPaths(paths);
    if (mode === "documentation") git("diff", "--check", base, head);
    output("mode", mode);
    summary(
      `Validación: **${mode}**. Rango: ${base ?? "sin base; validación completa"} → ${head}.`,
    );
  } else if (process.argv[2] === "gate") {
    const mode = verifyJobs(JSON.parse(process.env.CI_NEEDS_JSON ?? "{}"));
    const directory = resolve(process.env.CI_REPORT_DIR ?? "ci-results");
    const evidence = {
      schema: 1,
      sha: git("rev-parse", "HEAD"),
      runId: process.env.GITHUB_RUN_ID ?? "local",
      mode,
      result: "success",
      ...(mode === "full"
        ? {
            unit: verifyVitestReport(readJson(`${directory}/unit.json`)),
            integration: verifyVitestReport(readJson(`${directory}/integration.json`)),
            e2e: verifyE2eReports(readJson(`${directory}/inventory.json`), [
              readJson(`${directory}/e2e-1.json`),
              readJson(`${directory}/e2e-2.json`),
            ]),
          }
        : {}),
    };
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/ci-result.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    summary(`CI aprobado: **${mode}**, SHA \`${evidence.sha}\`.`);
    if (evidence.e2e) {
      summary(
        `${evidence.e2e.uniqueCases} casos únicos; ${evidence.e2e.scenarios} escenarios. Outbox: ${evidence.e2e.outbox}.`,
      );
      summary("\n| Partición | Casos | Segundos E2E |\n| --- | ---: | ---: |");
      for (const shard of evidence.e2e.shards) {
        summary(`| ${shard.shard}/2 | ${shard.cases} | ${(shard.durationMs / 1000).toFixed(1)} |`);
      }
      summary("\n| Archivo | Caso | Segundos |\n| --- | --- | ---: |");
      const cell = (text) => String(text).replace(/[|\r\n]/g, " ");
      for (const item of evidence.e2e.durations.slice(0, 10)) {
        summary(
          `| ${cell(item.file)} | ${cell(item.title)} | ${(item.durationMs / 1000).toFixed(1)} |`,
        );
      }
    }
    process.stdout.write(`CI aprobado: ${mode}\n`);
  } else if (process.argv[2] === "smoke-context") {
    const config = await readSmokeDeployment(
      process.env.GITHUB_EVENT_NAME,
      readJson(process.env.GITHUB_EVENT_PATH),
    );
    for (const key of ["base", "bucketOrigin", "sha", "indexing"]) output(key, config[key]);
    output("shouldRun", config.supersededBy ? "false" : "true");
    summary(
      config.supersededBy
        ? `Evento histórico omitido: el deployment ${config.supersededBy} es posterior y ya fue aprobado. No se certifica el SHA ${config.sha}.`
        : `Smoke del SHA \`${config.sha}\` en ${config.base}.`,
    );
  } else {
    throw new Error("Uso: node scripts/ci/run.mjs classify|gate|smoke-context");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  summary(`CI rechazado: ${message}`);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
