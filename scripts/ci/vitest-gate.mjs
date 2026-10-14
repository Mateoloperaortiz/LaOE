import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { verifyVitestReport } from "./reports.mjs";

const PROJECTS = ["unit", "integration"];

/** Los valores de una opción en sus dos formas: `--nombre=valor` y `--nombre valor`. */
function optionValues(args, name) {
  const values = [];
  for (const [index, arg] of args.entries()) {
    if (arg === name) values.push(args[index + 1]);
    else if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
  }
  return values;
}

/**
 * Cómo se corre un proyecto de Vitest para que deje el informe JSON que lee la compuerta.
 * Quien ya pide su informe (el CI, con `--outputFile`) conserva sus opciones tal cual; a los demás
 * se les suma el reporter JSON hacia `fallbackReport`, sin quitarles la salida de siempre.
 */
export function vitestInvocation(project, forwarded, fallbackReport) {
  assert(PROJECTS.includes(project), `Proyecto de Vitest desconocido: ${project}`);
  assert(
    !forwarded.some((arg) => arg.startsWith("--outputFile.")),
    "La compuerta lee un solo informe: usá --outputFile, no --outputFile.<reporter>",
  );
  const outputs = optionValues(forwarded, "--outputFile");
  const reporters = optionValues(forwarded, "--reporter");
  const args = ["run", "--project", project, ...forwarded];
  if (outputs.length === 0) {
    return {
      args: [
        ...args,
        ...(reporters.length === 0 ? ["--reporter=default"] : []),
        ...(reporters.includes("json") ? [] : ["--reporter=json"]),
        `--outputFile=${fallbackReport}`,
      ],
      report: fallbackReport,
    };
  }
  assert(
    outputs.length === 1 && typeof outputs[0] === "string" && outputs[0].length > 0,
    "--outputFile necesita una sola ruta",
  );
  assert(
    reporters.includes("json"),
    "Con --outputFile hace falta --reporter=json: la compuerta lee ese informe",
  );
  return { args, report: outputs[0] };
}

/**
 * Corre el proyecto y, si Vitest aprobó, pasa su informe por la comprobación de la compuerta del CI
 * (`verifyVitestReport`): un caso saltado falla acá igual que allá. Si Vitest ya falló se devuelve
 * su código, que el fallo ya quedó impreso.
 */
export function runVitestGated(project, forwarded, fallbackReport, run) {
  const { args, report } = vitestInvocation(project, forwarded, fallbackReport);
  // Un informe viejo en esa ruta no puede pasar por el de esta corrida.
  rmSync(report, { force: true });
  const status = run(args);
  if (status !== 0) return { status };
  return { status, ...verifyVitestReport(JSON.parse(readFileSync(report, "utf8"))) };
}
