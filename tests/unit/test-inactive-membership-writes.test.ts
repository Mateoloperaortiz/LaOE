import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Una membresía inactiva de una prueba sale de la fábrica (`seedMemberships`, que siembra la fila que
// deja una baja y lanza si la persona no es exalumna) o del comando de la baja (`endMembershipAs`).
// Un `update(membership)` suelto que le escribe `status: "INACTIVE"` arma lo que ninguna baja deja:
// sin último semestre, con la época del carné sin subir y la persona todavía de miembro, y la prueba
// queda en verde sobre eso (DT-382, ADR-128 regla 7). Por eso esta prueba lee el código: fuera de la
// fábrica no admite esa escritura si no está en su lista de excepciones.
//
// Lee todo `tests/` menos la fábrica, que es la que siembra, y las unitarias, que no tocan la base y
// traen escrituras de muestra en sus cadenas (las de este archivo).
//
// Cuenta tres cosas. La primera es la que busca; las otras dos son lo que no se deja leer, y caen
// igual, porque podrían ser lo mismo escrito de otra manera:
//
// - `INACTIVE`: el `.set({ … })` que sigue a `.update(membership)` escribe `status: "INACTIVE"`.
// - `no se lee`: ese `.set(` no recibe un objeto literal, trae un `...`, o le escribe a `status` algo
//   que no es un texto entre comillas dobles (una variable, `{ status }`, una clave entre corchetes);
//   o al `.update(membership)` no le sigue un `.set(`.
// - `SQL`: un `update membership set …` escrito a mano que nombra `status`.
//
// `membership` es la tabla de `@/modules/people/schema`, con ese nombre o con el que el archivo le
// ponga al importarla (`membership as m`). No sigue a la tabla por una variable ni por un parámetro
// (`const tabla = membership`), ni a un `status` que llegue armado desde otra función.
//
// No comparte su cuenta con `npm run audit:metrics`, y por eso el lector vive acá y no en
// `scripts/lib/test-suite-metrics.ts`.

const NOT_SCANNED_DIRS = ["tests/factories/", "tests/unit/"];

interface TextFile {
  path: string;
  text: string;
}

interface Finding {
  path: string;
  line: number;
  write: "INACTIVE" | "no se lee" | "SQL";
}

interface Exception {
  path: string;
  /** Cuántas escrituras de esas quedan en el archivo. */
  writes: number;
  /** Por qué no pasan por la fábrica ni por la baja, en una frase. */
  reason: string;
}

// Antes de sumar una acá: sembrá a la persona exalumna y su membresía con la fábrica, o dá la baja con
// `endMembershipAs`. La lista es para el escritor que la prueba arma a propósito.
const EXCEPTIONS: Exception[] = [
  {
    path: "tests/integration/membership-concurrency.test.ts",
    writes: 1,
    reason:
      "Es el otro escritor de una transacción que la prueba retiene para cruzarla con la baja: tiene que escribir por esa transacción y sin tomar el consultivo de la persona, que toman todos los comandos que escriben la fila (ADR-120 regla 3), y la fila que deja, sin motivo de salida y con la época sin subir, es lo que la prueba afirma.",
  },
];

/** El texto entre el paréntesis que abre en `open` y el que lo cierra, sin contar los de una cadena. */
function argumentAt(text: string, open: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  return null;
}

/** Qué le escribe a `status` el argumento de un `.set(`: nada, un estado que se lee, o no se sabe. */
function statusWritten(argument: string): Finding["write"] | null {
  const body = argument.trim();
  if (!body.startsWith("{") || body.includes("...")) return "no se lee";
  const mentions = body.match(/\bstatus\b/g)?.length ?? 0;
  if (mentions === 0) return null;
  const literals = [
    ...body.matchAll(/(?<![.\w"'`[])status\s*:\s*"([A-Z_]+)"(?:\s+as\s+const)?\s*(?=[,}])/g),
  ].map((match) => match[1]);
  if (literals.length !== mentions) return "no se lee";
  return literals.includes("INACTIVE") ? "INACTIVE" : null;
}

/** Los nombres con los que el archivo tiene a mano la tabla `membership` de people. */
function membershipNames(text: string): string[] {
  const names = new Set(["membership"]);
  for (const [, imported = ""] of text.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"@\/modules\/people\/schema"/g,
  )) {
    for (const [, alias = ""] of imported.matchAll(/\bmembership\s+as\s+(\w+)/g)) names.add(alias);
  }
  return [...names];
}

/** Cada escritura a `membership` que la deja inactiva, o que no deja leer qué estado le escribe. */
function inactiveMembershipWrites(files: TextFile[]): Finding[] {
  const found: Finding[] = [];
  for (const { path, text } of files) {
    const lineOf = (index: number) => text.slice(0, index).split("\n").length;
    const tables = membershipNames(text).join("|");
    for (const match of text.matchAll(new RegExp(`\\.update\\(\\s*(?:${tables})\\s*\\)`, "g"))) {
      const after = match.index + match[0].length;
      const set = /^\s*\.set\(/.exec(text.slice(after));
      const argument = set ? argumentAt(text, after + set[0].length - 1) : null;
      const write = argument === null ? "no se lee" : statusWritten(argument);
      if (write) found.push({ path, line: lineOf(match.index), write });
    }
    for (const match of text.matchAll(/\bupdate\s+(?:public\.)?"?membership"?\s+set\b[^`;]*/gi)) {
      if (/\bstatus\b/i.test(match[0])) {
        found.push({ path, line: lineOf(match.index), write: "SQL" });
      }
    }
  }
  return found;
}

/** Los archivos de código de `tests/` menos la fábrica y las unitarias. */
function scannedSources(): TextFile[] {
  return readdirSync("tests", { recursive: true, encoding: "utf8" })
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    .sort()
    .map((file) => ({ path: `tests/${file}`, text: readFileSync(join("tests", file), "utf8") }))
    .filter(({ path }) => !NOT_SCANNED_DIRS.some((dir) => path.startsWith(dir)));
}

const sample = (text: string) => inactiveMembershipWrites([{ path: "muestra.ts", text }]);
const writesOf = (text: string) => sample(text).map(({ write }) => write);

describe("la membresía inactiva de una prueba", () => {
  it("sale de la fábrica o del comando de la baja: fuera de la fábrica quedan solo los `update` de la lista de excepciones, ni uno más ni uno menos", () => {
    const counts: Record<string, number> = {};
    for (const { path } of inactiveMembershipWrites(scannedSources())) {
      counts[path] = (counts[path] ?? 0) + 1;
    }

    expect(counts).toEqual(
      Object.fromEntries(EXCEPTIONS.map(({ path, writes }) => [path, writes])),
    );
  });

  it("cada archivo está una sola vez en la lista, y cada excepción trae su razón en una frase", () => {
    expect(new Set(EXCEPTIONS.map(({ path }) => path)).size).toBe(EXCEPTIONS.length);
    for (const exception of EXCEPTIONS) {
      expect(exception.reason, exception.path).toMatch(/^\p{Lu}[^\n]{40,}\.$/u);
    }
  });

  it("el lector recorre las pruebas de integración, las de la E2E y sus ayudantes, y deja fuera la fábrica y las unitarias", () => {
    const paths = scannedSources().map(({ path }) => path);

    expect(paths).toContain("tests/integration/membership-concurrency.test.ts");
    expect(paths).toContain("tests/e2e/acceso.spec.ts");
    expect(paths).toContain("tests/helpers/locks.ts");
    expect(paths.filter((path) => NOT_SCANNED_DIRS.some((dir) => path.startsWith(dir)))).toEqual(
      [],
    );
  });
});

describe("lo que el lector de escrituras a `membership` cuenta", () => {
  it.each([
    ["en una línea", 'await db().update(membership).set({ status: "INACTIVE" }).where(x);'],
    [
      "partida en varias, con la fecha y el motivo",
      'await getDb()\n  .update(membership)\n  .set({ status: "INACTIVE", endedAt: new Date(), endReason: "OTHER" })\n  .where(x);',
    ],
    ["por una transacción", 'tx.update(membership).set({ endedAt: null, status: "INACTIVE" })'],
    ["con `as const`", 'tx.update( membership ).set({ status: "INACTIVE" as const })'],
    [
      "con la tabla importada con otro nombre",
      'import { membership as m } from "@/modules/people/schema";\ndb().update(m).set({ status: "INACTIVE" });',
    ],
  ])("la que deja inactiva una membresía, %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["INACTIVE"]);
  });

  it.each([
    ["una variable", "db().update(membership).set({ status: LEFT })"],
    ["la clave sola", "db().update(membership).set({ status })"],
    ["un ternario", 'db().update(membership).set({ status: left ? "INACTIVE" : "ACTIVE" })'],
    ["comillas simples", "db().update(membership).set({ status: 'INACTIVE' })"],
    ["una plantilla", "db().update(membership).set({ status: `INACTIVE` })"],
    ["la clave entre corchetes", 'db().update(membership).set({ ["status"]: "INACTIVE" })'],
    ["la clave entre comillas", 'db().update(membership).set({ "status": "INACTIVE" })'],
    ["un objeto esparcido", "db().update(membership).set({ ...ended })"],
    ["un objeto que llega armado", "db().update(membership).set(ended)"],
    ["un `update` sin su `.set(` a continuación", "const pending = db().update(membership);"],
  ])("la que no deja leer qué estado escribe: %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["no se lee"]);
  });

  it.each([
    ["en una plantilla", "await db().execute(sql`update membership set status = 'INACTIVE'`);"],
    [
      "con el esquema y entre comillas",
      '`UPDATE public."membership" SET ended_at = now(), status = $1`',
    ],
  ])("el SQL escrito a mano que le cambia el estado, %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["SQL"]);
  });

  it.each([
    ["otro estado", 'db().update(membership).set({ status: "ON_LEAVE", leaveUntil: null })'],
    ["la vuelta a activa", 'db().update(membership).set({ status: "ACTIVE", endedAt: null })'],
    ["otra columna", "db().update(membership).set({ firstTermId: previousTermId })"],
    ["la fecha de salida sola", "db().update(membership).set({ endedAt })"],
    ["otra tabla", 'db().update(committee).set({ status: "INACTIVE" })'],
    [
      "una tabla de nombre parecido",
      'db().update(committeeMembership).set({ status: "INACTIVE" })',
    ],
    ["un SQL que no toca el estado", "sql`update membership set ended_at = now()`"],
    ["una lectura", 'expect(row).toMatchObject({ status: "INACTIVE" })'],
  ])("no cuenta %s", (_title, text) => {
    expect(writesOf(text)).toEqual([]);
  });

  it("dice el archivo y la línea de cada una, y cuenta todas las de un archivo", () => {
    const text =
      'const a = 1;\nawait db().update(membership).set({ status: "INACTIVE" });\n\nawait tx\n  .update(membership)\n  .set(ended);\n';

    expect(sample(text)).toEqual([
      { path: "muestra.ts", line: 2, write: "INACTIVE" },
      { path: "muestra.ts", line: 5, write: "no se lee" },
    ]);
  });
});
