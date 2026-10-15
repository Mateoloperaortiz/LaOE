import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyVitestReport } from "../../scripts/ci/reports.mjs";
import { runVitestGated, vitestInvocation } from "../../scripts/ci/vitest-gate.mjs";

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Un informe con la forma del reporter JSON de Vitest, de un archivo y un caso por estado. */
function report(statuses: string[]) {
  return {
    success: !statuses.includes("failed"),
    numTotalTests: statuses.length,
    numPassedTests: statuses.filter((status) => status === "passed").length,
    numFailedTests: statuses.filter((status) => status === "failed").length,
    testResults: [
      {
        name: "tests/unit/ejemplo.test.ts",
        assertionResults: statuses.map((status) => ({ status })),
      },
    ],
  };
}

/** Los argumentos que el workflow le pasa a un script de npm, con cada expresión de Actions en «1». */
function ciArguments(script: string) {
  const line = repoFile(".github/workflows/ci.yml")
    .split("\n")
    .find((candidate) => candidate.includes(`run: ${script} -- `));
  if (!line) throw new Error(`El workflow ya no corre «${script} -- …»`);
  return line
    .slice(line.indexOf(" -- ") + 4)
    .replace(/\$\{\{[^}]*\}\}/g, "1")
    .trim()
    .split(/\s+/);
}

describe("cómo se corre Vitest para la compuerta", () => {
  it("sin opciones pide el informe JSON donde se le dice y conserva la salida por defecto", () => {
    expect(vitestInvocation("unit", [], "/tmp/informe.json")).toEqual({
      args: [
        "run",
        "--project",
        "unit",
        "--reporter=default",
        "--reporter=json",
        "--outputFile=/tmp/informe.json",
      ],
      report: "/tmp/informe.json",
    });
  });
  it("deja pasar el filtro de archivos de quien llama", () => {
    expect(
      vitestInvocation("integration", ["tests/integration/a.test.ts"], "/tmp/informe.json").args,
    ).toEqual([
      "run",
      "--project",
      "integration",
      "tests/integration/a.test.ts",
      "--reporter=default",
      "--reporter=json",
      "--outputFile=/tmp/informe.json",
    ]);
  });
  it("a quien trae su reporter le suma solo el JSON, y no lo repite si ya lo trae", () => {
    expect(vitestInvocation("unit", ["--reporter=verbose"], "/tmp/informe.json").args).toEqual([
      "run",
      "--project",
      "unit",
      "--reporter=verbose",
      "--reporter=json",
      "--outputFile=/tmp/informe.json",
    ]);
    expect(vitestInvocation("unit", ["--reporter", "json"], "/tmp/informe.json").args).toEqual([
      "run",
      "--project",
      "unit",
      "--reporter",
      "json",
      "--outputFile=/tmp/informe.json",
    ]);
  });
  it("los comandos del CI conservan sus opciones y dejan el informe donde lo lee la compuerta", () => {
    const unit = ciArguments("npm test");
    expect(vitestInvocation("unit", unit, "/tmp/informe.json")).toEqual({
      args: ["run", "--project", "unit", ...unit],
      report: "ci-results/unit.json",
    });
    const integration = ciArguments("npm run test:integration");
    expect(vitestInvocation("integration", integration, "/tmp/informe.json")).toEqual({
      args: ["run", "--project", "integration", ...integration],
      report: "ci-results/integration-1.json",
    });
  });
  it("lee la ruta de --outputFile también cuando viene separada", () => {
    expect(
      vitestInvocation(
        "unit",
        ["--reporter=json", "--outputFile", "otro.json"],
        "/tmp/informe.json",
      ).report,
    ).toBe("otro.json");
  });
  it("rechaza un proyecto que no reconoce y un informe que la compuerta no podría leer", () => {
    expect(() => vitestInvocation("e2e", [], "/tmp/informe.json")).toThrow("desconocido");
    expect(() => vitestInvocation(undefined, [], "/tmp/informe.json")).toThrow("desconocido");
    expect(() => vitestInvocation("unit", ["--outputFile=otro.json"], "/tmp/informe.json")).toThrow(
      "--reporter=json",
    );
    expect(() =>
      vitestInvocation("unit", ["--outputFile.json=otro.json"], "/tmp/informe.json"),
    ).toThrow("un solo informe");
    expect(() =>
      vitestInvocation(
        "unit",
        ["--reporter=json", "--outputFile=a.json", "--outputFile=b.json"],
        "/tmp/informe.json",
      ),
    ).toThrow("una sola ruta");
  });
});

describe("la corrida local pasa por la comprobación de la compuerta", () => {
  const directories: string[] = [];
  const target = () => {
    const directory = mkdtempSync(join(tmpdir(), "ci-vitest-gate-"));
    directories.push(directory);
    return join(directory, "informe.json");
  };
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });
  /** Un Vitest de mentira: escribe el informe en la ruta que se le pidió y termina con `status`. */
  const vitest = (content: unknown, status = 0) => {
    const calls: string[][] = [];
    const run = (args: string[]) => {
      calls.push(args);
      const output = args.find((arg) => arg.startsWith("--outputFile="));
      if (content !== null && output) {
        writeFileSync(output.slice("--outputFile=".length), JSON.stringify(content));
      }
      return status;
    };
    return { run, calls };
  };

  it("con todos los casos aprobados devuelve el conteo de la compuerta", () => {
    const path = target();
    const { run, calls } = vitest(report(["passed", "passed"]));
    expect(runVitestGated("unit", [], path, run)).toEqual({ status: 0, cases: 2, files: 1 });
    expect(calls).toEqual([vitestInvocation("unit", [], path).args]);
  });
  it.each([
    "skipped",
    "pending",
    "todo",
  ])("un caso «%s» falla con el mismo mensaje con que la compuerta rechaza ese informe", (status) => {
    const omitted = report(["passed", status]);
    let expected = "";
    try {
      verifyVitestReport(omitted);
    } catch (error) {
      expected = (error as Error).message;
    }
    expect(expected).toContain("Vitest omitió casos");
    expect(() => runVitestGated("integration", [], target(), vitest(omitted).run)).toThrow(
      expected,
    );
  });
  it("si Vitest falla devuelve su código y no lee el informe", () => {
    expect(runVitestGated("unit", [], target(), vitest(null, 1).run)).toEqual({ status: 1 });
    expect(runVitestGated("unit", [], target(), vitest(report(["failed"]), 1).run)).toEqual({
      status: 1,
    });
  });
  it("un informe viejo en la misma ruta no pasa por el de esta corrida", () => {
    const path = target();
    writeFileSync(path, JSON.stringify(report(["passed"])));
    expect(() => runVitestGated("unit", [], path, vitest(null).run)).toThrow("ENOENT");
  });
});

describe("los scripts de npm que corren Vitest", () => {
  const { scripts } = JSON.parse(repoFile("package.json")) as { scripts: Record<string, string> };
  it("npm test y npm run test:integration pasan por la compuerta, y npm run check corre los dos", () => {
    expect(scripts.test).toBe("node scripts/ci/run.mjs vitest unit");
    expect(scripts["test:integration"]).toBe("node scripts/ci/run.mjs vitest integration");
    const check = (scripts.check ?? "").split(" && ");
    expect(check).toContain("npm run test");
    expect(check).toContain("npm run test:integration");
  });

  const environments: Array<
    [project: "unit" | "integration", inherited: "development" | "production"]
  > = [
    ["unit", "development"],
    ["integration", "development"],
    ["unit", "production"],
    ["integration", "production"],
  ];
  it.each(
    environments,
  )("%s fija test para Vitest sin cambiar el entorno %s de quien lo lanza", (project, inherited) => {
    // Carga el runner real y captura su frontera con el proceso hijo: no arranca Vitest recursivo
    // ni la base. Su hijo sintético produce un informe válido para conservar la compuerta completa.
    const runner = new URL("../../scripts/ci/run.mjs", import.meta.url).href;
    const source = `
      import childProcess from "node:child_process";
      import { writeFileSync } from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      let child;
      childProcess.spawnSync = (_command, args, options) => {
        child = { nodeEnv: options.env?.NODE_ENV ?? process.env.NODE_ENV,
          inheritedValue: options.env?.VITEST_ENV_SENTINEL ?? process.env.VITEST_ENV_SENTINEL };
        const output = args.find((arg) => arg.startsWith("--outputFile="));
        if (!output) throw new Error("El runner no pidió su informe");
        writeFileSync(output.slice("--outputFile=".length), ${JSON.stringify(JSON.stringify(report(["passed"])))});
        return { status: 0 };
      };
      syncBuiltinESMExports();
      process.argv = [process.execPath, ${JSON.stringify(runner)}, "vitest", ${JSON.stringify(project)}];
      await import(${JSON.stringify(runner)});
      process.stdout.write(JSON.stringify({ child, parentNodeEnv: process.env.NODE_ENV }) + "\\n");
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: inherited, VITEST_ENV_SENTINEL: "conservado" },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "null")).toEqual({
      child: { nodeEnv: "test", inheritedValue: "conservado" },
      parentNodeEnv: inherited,
    });
  });
});
