import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El kit del admin le entrega a cada recurso el actor de la escritura, con la IP del request, y el
// recurso lo pasa entero a `runCommand` o a su comando «As» (ADR-082 regla 2; ADR-116 regla 10). Un
// recurso que lo vuelve a armar a mano deja su auditoría sin IP y ninguna prueba de conducta lo nota:
// el comando funciona igual.
//
// Por qué sigue acá con la IP obligatoria en `Actor` (ADR-121 regla 1): el compilador rechaza
// `{ personId: actor.personId }`, pero no `{ personId: actor.personId, ip: null }`, que es justo el
// arreglo que sugiere su error («Property 'ip' is missing»). Esta prueba vigila lo que el tipo no ve.
// Lee el código de los recursos, que viven en el `admin.ts` de cada módulo y en el registro que los
// compone. Y como el tipo obliga a escribir la IP, busca también el `ip: null` suelto: lo encuentra con
// cualquier nombre de parámetro, que era por donde se evadía (DT-177).

const RESOURCE_FILES = [
  ...readdirSync("src/modules")
    .map((module) => `src/modules/${module}/admin.ts`)
    .filter((file) => existsSync(file)),
  "src/app/admin/_kit/registry.ts",
];

/** Un comando (`runCommand` o un «As») que recibe un literal como actor. */
const LITERAL_ACTOR = /\b(?:runCommand|\w+As)\(\s*\{[^}]*\}/g;
/** Un literal que copia el `personId` del actor: el actor a medio armar, aunque pase por una variable. */
const COPIED_ACTOR = /\bpersonId:\s*actor\b[^,}]*/g;
/** Una IP nula escrita a mano: un recurso no tiene por qué escribirla, se llame como se llame su actor. */
const NULL_IP = /\bip:\s*null\b/g;

function handBuiltActors(source: string): string[] {
  return [
    ...source.matchAll(LITERAL_ACTOR),
    ...source.matchAll(COPIED_ACTOR),
    ...source.matchAll(NULL_IP),
  ].map((match) => match[0].replace(/\s+/g, " "));
}

describe("el actor de un comando en los recursos del admin kit", () => {
  it("ningún recurso arma el actor a mano: entrega el que le dio el kit", () => {
    const found = RESOURCE_FILES.flatMap((file) =>
      handBuiltActors(readFileSync(file, "utf8")).map((match) => `${file}: ${match}`),
    );
    expect(found).toEqual([]);
  });

  it("la búsqueda cubre los recursos de todos los módulos y reconoce las formas de armarlo a mano", () => {
    expect(RESOURCE_FILES).toEqual(
      expect.arrayContaining([
        "src/modules/identity/admin.ts",
        "src/modules/people/admin.ts",
        "src/modules/participation/admin.ts",
      ]),
    );
    expect(RESOURCE_FILES.length).toBeGreaterThanOrEqual(12);
    expect(
      handBuiltActors("runCommand({ personId: actor.personId }, (ctx) => grant(ctx, input))"),
    ).not.toEqual([]);
    expect(
      handBuiltActors("createGroupAs(\n  { personId: actor.personId, ip: null },\n  input)"),
    ).not.toEqual([]);
    expect(
      handBuiltActors("const who = { personId: actor.personId };\nrunCommand(who, run)"),
    ).not.toEqual([]);
    // Con otro nombre de parámetro y por una variable: lo delata la IP que el tipo obliga a escribir.
    expect(
      handBuiltActors(
        "create: (who, input) => {\n  const mine = { personId: who.personId, ip: null };\n  return runCommand(mine, run);\n}",
      ),
    ).toEqual(["ip: null"]);
    expect(handBuiltActors("runCommand(actor, (ctx) => grant(ctx, input))")).toEqual([]);
    expect(handBuiltActors("createGroupAs(actor, await toGroupInput(input))")).toEqual([]);
    // La IP de una fila que el recurso muestra o exporta no es un actor.
    expect(
      handBuiltActors("exportRow: (row) => ({ persona: row.personName, ip: row.ip })"),
    ).toEqual([]);
  });
});
