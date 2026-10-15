import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import durations from "./e2e-durations.json" with { type: "json" };
import {
  durationsFromResult,
  E2E_SHARDS,
  listSpecFiles,
  parseShard,
  partitionFiles,
} from "./e2e-partition.mjs";
import integrationDurations from "./integration-durations.json" with { type: "json" };
import {
  durationsFromVitestReport,
  INTEGRATION_SHARDS,
  integrationFileOf,
  integrationPartitions,
} from "./integration-partition.mjs";
import { classifyPaths, comparisonBase, verifyJobs } from "./policy.mjs";
import { findPromotionEvidence, promotionHead, REPOSITORY, verifyEvidence } from "./promotion.mjs";
import { verifyE2eReports, verifyIntegrationReports, verifyVitestReport } from "./reports.mjs";
import { readSmokeDeployment } from "./smoke-context.mjs";
import { runVitestGated } from "./vitest-gate.mjs";

const VITEST = fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trimEnd();
const output = (name, value) => {
  process.stdout.write(`${name}=${value}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
};
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};
const message = (error) => (error instanceof Error ? error.message : String(error));

/** `gh` usa el token efímero del workflow (GH_TOKEN). La evidencia solo acelera; nunca decide. */
function listRuns(head) {
  const query = new URLSearchParams({
    head_sha: head,
    branch: "main",
    event: "push",
    status: "success",
    per_page: "100",
  });
  const page = execFileSync(
    "gh",
    ["api", `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?${query}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 30_000 },
  );
  return JSON.parse(page).workflow_runs;
}

/** `gh` descarga el artefacto de otra ejecución con el mismo token; sin artefacto no hay evidencia. */
function downloadResult(runId) {
  const directory = mkdtempSync(join(tmpdir(), "ci-evidence-"));
  try {
    execFileSync(
      "gh",
      [
        "run",
        "download",
        String(runId),
        "--name",
        "ci-result",
        "--dir",
        directory,
        "--repo",
        REPOSITORY,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
  } catch {
    return null;
  }
  const file = readdirSync(directory, { recursive: true, encoding: "utf8" }).find((name) =>
    name.endsWith("ci-result.json"),
  );
  return file ? readJson(join(directory, file)) : null;
}

function currentPartitions() {
  return partitionFiles(listSpecFiles(), durations.files);
}

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
    let mode = classifyPaths(paths);
    if (mode === "documentation") git("diff", "--check", base, head);
    const notes = [`Rango: ${base ?? "sin base; validación completa"} → ${head}.`];
    // ADR-054: una promoción reutiliza el CI completo de main del mismo SHA; cualquier duda es full.
    const promoted = promotionHead(
      process.env.GITHUB_EVENT_NAME,
      process.env.GITHUB_REF,
      event,
      head,
    );
    if (mode === "full" && promoted) {
      try {
        const found = await findPromotionEvidence(promoted, {
          listRuns,
          downloadResult,
          currentRunId: process.env.GITHUB_RUN_ID,
        });
        if (found) {
          mode = "promotion";
          mkdirSync("ci-results", { recursive: true });
          writeFileSync(
            "ci-results/promotion.json",
            `${JSON.stringify({ schema: 1, sha: head, ...found }, null, 2)}\n`,
          );
          notes.push(
            `Se reutiliza el CI completo de main ${found.run.html_url} (${found.run.created_at}).`,
          );
        } else {
          notes.push("Sin CI completo reutilizable para este SHA: se ejecuta toda la suite.");
        }
      } catch (error) {
        notes.push(`Evidencia no reutilizable (${message(error)}): se ejecuta toda la suite.`);
      }
    }
    output("mode", mode);
    process.stdout.write(`${notes.join(" ")}\n`);
    summary(`Validación: **${mode}**. ${notes.join(" ")}`);
  } else if (process.argv[2] === "gate") {
    const mode = verifyJobs(JSON.parse(process.env.CI_NEEDS_JSON ?? "{}"));
    const directory = resolve(process.env.CI_REPORT_DIR ?? "ci-results");
    const head = git("rev-parse", "HEAD");
    const evidence = {
      schema: 1,
      sha: head,
      runId: process.env.GITHUB_RUN_ID ?? "local",
      mode,
      result: "success",
    };
    if (mode === "full") {
      const partitions = currentPartitions();
      const integration = integrationPartitions();
      Object.assign(evidence, {
        unit: verifyVitestReport(readJson(`${directory}/unit.json`)),
        integration: verifyIntegrationReports(
          integration.map((_, index) => readJson(`${directory}/integration-${index + 1}.json`)),
          integration,
          integrationFileOf,
        ),
        e2e: verifyE2eReports(
          readJson(`${directory}/inventory.json`),
          partitions.map((_, index) => readJson(`${directory}/e2e-${index + 1}.json`)),
          partitions,
        ),
      });
    } else if (mode === "promotion") {
      const record = readJson(`${directory}/promotion.json`);
      assert.equal(record.schema, 1, "Registro de promoción desconocido");
      assert.equal(record.sha, head, "El registro de promoción es de otro SHA");
      const reused = verifyEvidence(head, record.run, record.evidence);
      Object.assign(evidence, {
        reused,
        unit: reused.unit,
        integration: reused.integration,
        e2e: reused.e2e,
      });
    }
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/ci-result.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    summary(`CI aprobado: **${mode}**, SHA \`${evidence.sha}\`.`);
    if (evidence.reused) {
      summary(
        `Evidencia reutilizada: ${evidence.reused.url} (main, ${evidence.reused.createdAt}) con ${evidence.unit.cases} unitarias, ${evidence.integration.cases} de integración y ${evidence.e2e.uniqueCases} casos E2E.`,
      );
    }
    if (evidence.e2e && mode === "full") {
      summary(
        `${evidence.e2e.uniqueCases} casos únicos; ${evidence.e2e.scenarios} escenarios. Outbox: ${evidence.e2e.outbox}. Integración: ${evidence.integration.cases} casos en ${evidence.integration.files} archivos (${evidence.integration.shards.map((shard) => `${shard.files} archivos y ${shard.cases} casos en ${shard.shard}/${INTEGRATION_SHARDS}`).join("; ")}).`,
      );
      summary("\n| Partición | Archivos | Casos | Segundos E2E |\n| --- | ---: | ---: | ---: |");
      for (const shard of evidence.e2e.shards) {
        summary(
          `| ${shard.shard}/${E2E_SHARDS} | ${shard.files} | ${shard.cases} | ${(shard.durationMs / 1000).toFixed(1)} |`,
        );
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
  } else if (process.argv[2] === "e2e-shard") {
    const current = parseShard(process.argv[3]);
    const partition = currentPartitions()[current - 1];
    output("files", partition.files.join(","));
    process.stdout.write(`${partition.files.join("\n")}\n`);
    summary(
      `Partición ${current}/${E2E_SHARDS}: ${partition.files.length} archivos, ~${partition.seconds.toFixed(0)} s según la ejecución ${durations.sourceRunId}.`,
    );
  } else if (process.argv[2] === "integration-shard") {
    const current = parseShard(process.argv[3], INTEGRATION_SHARDS);
    const partition = integrationPartitions()[current - 1];
    output("files", partition.files.join(" "));
    process.stdout.write(`${partition.files.join("\n")}\n`);
    summary(
      `Integración ${current}/${INTEGRATION_SHARDS}: ${partition.files.length} archivos, ~${partition.seconds.toFixed(0)} s de pruebas según la ejecución ${integrationDurations.sourceRunId}.`,
    );
  } else if (process.argv[2] === "integration-durations") {
    const generated = durationsFromVitestReport(
      readJson(process.argv[3]),
      process.argv[4] ?? "manual",
      process.argv[5] ?? "manual",
    );
    writeFileSync(
      new URL("./integration-durations.json", import.meta.url),
      `${JSON.stringify(generated, null, 2)}\n`,
    );
    process.stdout.write(
      `Duraciones de ${Object.keys(generated.files).length} archivos de integración desde la ejecución ${generated.sourceRunId}.\n`,
    );
  } else if (process.argv[2] === "e2e-durations") {
    const generated = durationsFromResult(readJson(process.argv[3]));
    writeFileSync(
      new URL("./e2e-durations.json", import.meta.url),
      `${JSON.stringify(generated, null, 2)}\n`,
    );
    process.stdout.write(
      `Duraciones de ${Object.keys(generated.files).length} archivos desde la ejecución ${generated.sourceRunId}.\n`,
    );
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
  } else if (process.argv[2] === "vitest") {
    // Lo que corren `npm test` y `npm run test:integration`: Vitest y, si aprobó, la misma
    // comprobación del informe que hace `gate` (ADR-120 regla 14).
    const project = process.argv[3];
    const directory = mkdtempSync(join(tmpdir(), "ci-vitest-"));
    try {
      const result = runVitestGated(
        project,
        process.argv.slice(4),
        join(directory, "report.json"),
        (args) => {
          const run = spawnSync(process.execPath, [VITEST, ...args], {
            stdio: "inherit",
            // El .env usado para la BD puede traer development. Solo Vitest fuerza test; el
            // proceso que lo lanzó conserva su entorno para el build que corre después.
            env: { ...process.env, NODE_ENV: "test" },
          });
          if (run.error) throw run.error;
          return run.status ?? 1;
        },
      );
      if (result.status === 0) {
        process.stdout.write(
          `Informe de Vitest (${project}): ${result.cases} casos en ${result.files} archivos, todos aprobados.\n`,
        );
      } else {
        process.exitCode = result.status;
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  } else {
    throw new Error(
      "Uso: node scripts/ci/run.mjs classify|gate|vitest <unit|integration> [opciones de Vitest]|e2e-shard k/n|integration-shard k/n|e2e-durations <ci-result.json>|integration-durations <integration.json> [run] [sha]|smoke-context",
    );
  }
} catch (error) {
  summary(`CI rechazado: ${message(error)}`);
  process.stderr.write(`${message(error)}\n`);
  process.exitCode = 1;
}
