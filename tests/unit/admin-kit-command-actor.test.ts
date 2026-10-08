import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El kit del admin le entrega a cada recurso el actor de la escritura, con la IP del request, y el
// recurso lo pasa entero a `runCommand` o a su comando «As» (ADR-082 regla 2; ADR-116 regla 10). Un
// recurso que lo vuelve a armar a mano (`{ personId: actor.personId }`) deja su auditoría sin IP y
// ninguna prueba de conducta lo nota: el comando funciona igual. Por eso esta prueba lee el código de
// los recursos, que viven en el `admin.ts` de cada módulo y en el registro que los compone.

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

function handBuiltActors(source: string): string[] {
  return [...source.matchAll(LITERAL_ACTOR), ...source.matchAll(COPIED_ACTOR)].map((match) =>
    match[0].replace(/\s+/g, " "),
  );
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
    expect(handBuiltActors("runCommand(actor, (ctx) => grant(ctx, input))")).toEqual([]);
    expect(handBuiltActors("createGroupAs(actor, await toGroupInput(input))")).toEqual([]);
  });
});
