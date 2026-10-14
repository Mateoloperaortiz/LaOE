import { describe, expect, it } from "vitest";
import { countByKey, expectReasonedOnce, sourceFiles, type TextFile } from "../helpers/ratchet";

// Una membresía inactiva de una prueba sale de la fábrica (`seedMemberships`, que siembra la fila que
// deja una baja y lanza si la persona no es egresada) o del comando de la baja (`endMembershipAs`).
// Un `update(membership)` suelto que le escribe `status: "INACTIVE"` arma lo que ninguna baja deja:
// sin último semestre, con la época del carné sin subir y la persona todavía de miembro, y la prueba
// queda en verde sobre eso (DT-382, ADR-128 regla 7). Por eso esta prueba lee el código: fuera de la
// fábrica no admite esa escritura si no está en su lista de excepciones.
//
// Lo mismo vale para la fecha de salida (DT-397, ADR-129 regla 10): la escribe la baja, y la fábrica
// la recibe en `exit.endedAt`. Un `update` suelto que la reescribe puede dejar a alguien saliendo
// antes de su término de ingreso, como pasaba en `tests/integration/alumni.test.ts`.
//
// Lee todo `tests/` menos la fábrica, que es la que siembra, y las unitarias, que no tocan la base y
// traen escrituras de muestra en sus cadenas (las de este archivo).
//
// Cuenta cuatro cosas. Las dos primeras son las que busca; las otras dos son lo que no se deja leer, y
// caen igual, porque podrían ser lo mismo escrito de otra manera:
//
// - `INACTIVE`: el `.set({ … })` que sigue a `.update(membership)` escribe `status: "INACTIVE"`.
// - `exitDate`: ese `.set({ … })` no toca el estado y nombra `endedAt` con algo que no es `null`: una
//   fecha, la clave sola (`{ endedAt }`) o la clave entre comillas. Borrarla (`endedAt: null`) no
//   cuenta: es la vuelta a activa, que no arma una salida.
// - `unreadable`, lo que no se lee: ese `.set(` no recibe un objeto literal, trae un `...`, o le escribe a `status` algo
//   que no es un texto entre comillas dobles (una variable, `{ status }`, una clave entre corchetes);
//   o al `.update(membership)` no le sigue un `.set(`.
// - `SQL`: un `update membership set …` escrito a mano que nombra `status`, o `ended_at` con algo que
//   no es `null`, también con `only`, con un alias, con un comentario antes de la tabla o con la tabla
//   interpolada (`update ${membership} set`). Si lo interpolado no es la tabla por ninguno de sus
//   nombres, cae como `unreadable`.
//
// `membership` es la tabla de `modules/people/schema`, tomada con `@/` o con una ruta relativa, con
// ese nombre o con el que el archivo le ponga: `membership as m` en un `import`, `membership: m` al
// desestructurar un `import("…")`, o `espacio.membership` si toma el schema entero. No sigue a la
// tabla por una variable ni por un parámetro (`const tabla = membership`), por un `require` ni
// reexportada por otro archivo, ni a un `status` que llegue armado desde otra función.
//
// No comparte su cuenta con `npm run audit:metrics`, y por eso el lector vive acá y no en
// `scripts/lib/test-suite-metrics.ts`.

const NOT_SCANNED_DIRS = ["tests/factories/", "tests/unit/"];

interface Finding {
  path: string;
  line: number;
  write: "INACTIVE" | "exitDate" | "unreadable" | "SQL";
}

interface Exception {
  path: string;
  /** Cuántas escrituras de esas quedan en el archivo. */
  writes: number;
  /** Por qué no pasan por la fábrica ni por la baja, en una frase. */
  reason: string;
}

// Antes de sumar una acá: sembrá a la persona egresada y su membresía con la fábrica, o dá la baja con
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
  if (!body.startsWith("{") || body.includes("...")) return "unreadable";
  const mentions = body.match(/\bstatus\b/g)?.length ?? 0;
  if (mentions === 0) return null;
  const literals = [
    ...body.matchAll(/(?<![.\w"'`[])status\s*:\s*"([A-Z_]+)"(?:\s+as\s+const)?\s*(?=[,}])/g),
  ].map((match) => match[1]);
  if (literals.length !== mentions) return "unreadable";
  return literals.includes("INACTIVE") ? "INACTIVE" : null;
}

/** Si el argumento de un `.set(` le escribe a `endedAt` algo que no es `null`: una fecha de salida. */
function exitDateWritten(argument: string): Finding["write"] | null {
  const mentions = argument.match(/\bendedAt\b/g)?.length ?? 0;
  const cleared = argument.match(/(?<![.\w"'`[])endedAt\s*:\s*null\s*(?=[,}])/g)?.length ?? 0;
  return mentions > cleared ? "exitDate" : null;
}

/** Si lo que sigue al `set` de un SQL nombra `ended_at` con algo que no es `null`. */
function sqlWritesExitDate(written: string): boolean {
  const mentions = written.match(/\bended_at\b/gi)?.length ?? 0;
  const cleared = written.match(/\bended_at"?\s*=\s*null\b/gi)?.length ?? 0;
  return mentions > cleared;
}

/** El schema de people como lo nombra quien lo carga, con `@/` o con una ruta relativa. */
const PEOPLE_SCHEMA = String.raw`["'][^"'\n]*modules\/people\/schema(?:\.[cm]?[jt]s)?["']`;

/**
 * Los nombres con los que el archivo tiene a mano la tabla `membership` de people, como trozos de una
 * expresión regular: el suyo; el que le ponga un `import { membership as m }` o un
 * `const { membership: m } = await import("…")`, y `espacio.membership` si toma el schema entero, con
 * `import * as espacio` o con `const espacio = await import("…")`.
 */
function membershipNames(text: string): string[] {
  const names = new Set(["membership"]);
  const all = (pattern: string) =>
    [...text.matchAll(new RegExp(pattern, "g"))].map((match) => match[1] ?? "");
  const renamed = (list: string, link: string) => {
    for (const [, alias = ""] of list.matchAll(
      new RegExp(String.raw`\bmembership\s*${link}\s*(\w+)`, "g"),
    )) {
      names.add(alias);
    }
  };
  for (const list of all(String.raw`import\s*\{([^}]*)\}\s*from\s*${PEOPLE_SCHEMA}`)) {
    renamed(list, String.raw`\bas\b`);
  }
  for (const list of all(String.raw`\{([^}]*)\}\s*=\s*await\s+import\(\s*${PEOPLE_SCHEMA}\s*\)`)) {
    renamed(list, ":");
  }
  for (const space of [
    ...all(String.raw`import\s*\*\s*as\s+(\w+)\s*from\s*${PEOPLE_SCHEMA}`),
    ...all(String.raw`\b(\w+)\s*(?::[^=;]+)?=\s*await\s+import\(\s*${PEOPLE_SCHEMA}\s*\)`),
  ]) {
    names.add(String.raw`${space}\.membership`);
  }
  return [...names];
}

/** Lo que separa dos palabras de una sentencia SQL: espacios o un comentario. */
const SQL_GAP = String.raw`(?:\s|\/\*[\s\S]*?\*\/|--[^\n]*\n)+`;
/** Un nombre de SQL: escrito, con comillas o sin ellas, o interpolado. */
const SQL_NAME = String.raw`(?:\$\{[^}]*\}|"?\w+"?)`;

/**
 * Un `update … set` escrito a mano: con `only` o sin él, la tabla con su esquema si lo trae, su alias
 * si lo trae, y lo que sigue al `set` hasta el final de la sentencia, sin cortar en un `;` que va
 * dentro de un texto de SQL.
 */
const SQL_UPDATE = new RegExp(
  String.raw`\bupdate${SQL_GAP}(?:only${SQL_GAP})?(?:${SQL_NAME}\.)?(${SQL_NAME})(?:${SQL_GAP}(?:as${SQL_GAP})?(?!set\b)"?\w+"?)?${SQL_GAP}set\b((?:'[^']*'|[^\`;])*)`,
  "gi",
);

/**
 * Cada escritura a `membership` que la deja inactiva o le escribe la fecha de salida, o que no deja
 * leer qué le escribe.
 */
function inactiveMembershipWrites(files: TextFile[]): Finding[] {
  const found: Finding[] = [];
  for (const { path, text } of files) {
    const lineOf = (index: number) => text.slice(0, index).split("\n").length;
    const tables = membershipNames(text).join("|");
    for (const match of text.matchAll(
      new RegExp(String.raw`\.update\(\s*(?:${tables})\s*,?\s*\)`, "g"),
    )) {
      const after = match.index + match[0].length;
      const set = /^\s*\.set\(/.exec(text.slice(after));
      const argument = set ? argumentAt(text, after + set[0].length - 1) : null;
      const write =
        argument === null ? "unreadable" : (statusWritten(argument) ?? exitDateWritten(argument));
      if (write) found.push({ path, line: lineOf(match.index), write });
    }
    const named = new RegExp(`^(?:${tables})$`);
    for (const match of text.matchAll(SQL_UPDATE)) {
      const [, target = "", written = ""] = match;
      // La tabla interpolada es la de people si lo interpolado es uno de sus nombres. Si es otra
      // cosa no se sabe a qué tabla escribe, y con `status` o una fecha de salida en la sentencia
      // cae igual.
      const interpolated = /^\$\{([^}]*)\}$/.exec(target)?.[1]?.trim();
      const isMembership =
        interpolated === undefined ? /^"?membership"?$/i.test(target) : named.test(interpolated);
      const watched = /\bstatus\b/i.test(written) || sqlWritesExitDate(written);
      if ((isMembership || interpolated !== undefined) && watched) {
        found.push({ path, line: lineOf(match.index), write: isMembership ? "SQL" : "unreadable" });
      }
    }
  }
  return found;
}

/** Los archivos de código de `tests/` menos la fábrica y las unitarias. */
function scannedSources(): TextFile[] {
  return sourceFiles("tests").filter(
    ({ path }) => !NOT_SCANNED_DIRS.some((dir) => path.startsWith(dir)),
  );
}

const sample = (text: string) => inactiveMembershipWrites([{ path: "muestra.ts", text }]);
const writesOf = (text: string) => sample(text).map(({ write }) => write);

describe("la membresía inactiva de una prueba", () => {
  it("sale de la fábrica o del comando de la baja, con su fecha de salida: fuera de la fábrica quedan solo los `update` de la lista de excepciones, ni uno más ni uno menos", () => {
    const counts = countByKey(inactiveMembershipWrites(scannedSources()), ({ path }) => path);

    expect(counts).toEqual(
      Object.fromEntries(EXCEPTIONS.map(({ path, writes }) => [path, writes])),
    );
  });

  it("cada archivo está una sola vez en la lista, y cada excepción trae su razón en una frase", () => {
    expectReasonedOnce(EXCEPTIONS, ({ path }) => path);
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
    [
      "con la tabla importada por una ruta relativa y con otro nombre",
      'import { membership as m } from "../../src/modules/people/schema";\ndb().update(m).set({ status: "INACTIVE" });',
    ],
    [
      "con el schema importado entero",
      'import * as people from "@/modules/people/schema";\ndb().update(people.membership).set({ status: "INACTIVE" });',
    ],
    [
      "con la tabla tomada de una carga, con otro nombre",
      'const { membership: m } = await import("@/modules/people/schema");\ndb().update(m).set({ status: "INACTIVE" });',
    ],
    [
      "con la carga del schema guardada en una variable",
      'const people = await import("@/modules/people/schema");\ndb().update(people.membership).set({ status: "INACTIVE" });',
    ],
    [
      "con una coma después de la tabla",
      'db()\n  .update(\n    membership,\n  )\n  .set({ status: "INACTIVE" });',
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
    [
      "un SQL con la tabla interpolada, que no es la de people por ninguno de sus nombres",
      "sql`update ${table} set status = 'INACTIVE'`",
    ],
    [
      "un SQL con la tabla interpolada, que no es la de people, y una fecha de salida",
      "sql`update ${table} set ended_at = now()`",
    ],
  ])("la que no deja leer qué estado escribe: %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["unreadable"]);
  });

  it.each([
    ["la clave sola", "db().update(membership).set({ endedAt })"],
    ["una fecha", 'db().update(membership).set({ endedAt: new Date("2023-12-01T05:00:00Z") })'],
    [
      "partida en varias líneas, con el motivo",
      'await getDb()\n  .update(membership)\n  .set({ endedAt: left, endReason: "OTHER" })\n  .where(x);',
    ],
    ["la clave entre comillas", 'db().update(membership).set({ "endedAt": left })'],
    [
      "con otro estado que no es la baja",
      'db().update(membership).set({ status: "ON_LEAVE", endedAt: left })',
    ],
    [
      "nombrada en el valor de otra clave, que cae por las dudas",
      "db().update(membership).set({ leaveUntil: previous.endedAt })",
    ],
  ])("la que le escribe la fecha de salida sin dejarla inactiva: %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["exitDate"]);
  });

  it.each([
    ["en una plantilla", "await db().execute(sql`update membership set status = 'INACTIVE'`);"],
    [
      "con el esquema y entre comillas",
      '`UPDATE public."membership" SET ended_at = now(), status = $1`',
    ],
    ["con un alias", "sql`update membership as m set status = 'INACTIVE' where m.id = ${id}`"],
    ["con un alias sin `as`", "sql`update membership m set status = 'INACTIVE'`"],
    ["con `only`", "`UPDATE ONLY membership SET status = $1`"],
    [
      "con un comentario antes de la tabla",
      "sql`update /* la de people */ membership set status = 'INACTIVE'`",
    ],
    [
      "con un `;` dentro de un texto antes del estado",
      "sql`update membership set end_reason = 'a;b', status = 'INACTIVE'`",
    ],
    ["con la tabla interpolada", "sql`update ${membership} set status = 'INACTIVE'`"],
    ["que le escribe la fecha de salida", "sql`update membership set ended_at = now()`"],
    [
      "que le escribe la fecha de salida, con la tabla interpolada",
      "sql`update ${membership} set ended_at = ${left}`",
    ],
    [
      "con la tabla interpolada por el nombre que le da el archivo",
      "import * as people from \"@/modules/people/schema\";\nsql`update ${people.membership} set status = 'INACTIVE'`",
    ],
  ])("el SQL escrito a mano que le cambia el estado o la fecha de salida, %s", (_title, text) => {
    expect(writesOf(text)).toEqual(["SQL"]);
  });

  it.each([
    ["otro estado", 'db().update(membership).set({ status: "ON_LEAVE", leaveUntil: null })'],
    ["la vuelta a activa", 'db().update(membership).set({ status: "ACTIVE", endedAt: null })'],
    ["otra columna", "db().update(membership).set({ firstTermId: previousTermId })"],
    [
      "la fecha de salida borrada, con su motivo y su último semestre",
      "db().update(membership).set({ endedAt: null, endReason: null, lastTermId: null })",
    ],
    ["otra tabla", 'db().update(committee).set({ status: "INACTIVE" })'],
    [
      "una tabla de nombre parecido",
      'db().update(committeeMembership).set({ status: "INACTIVE" })',
    ],
    ["un SQL que no toca el estado ni la fecha", "sql`update membership set leave_until = null`"],
    ["un SQL que borra la fecha de salida", "sql`update membership set ended_at = null`"],
    ["una lectura", 'expect(row).toMatchObject({ status: "INACTIVE" })'],
    [
      "un SQL con la tabla interpolada que no toca el estado ni la fecha",
      "sql`update ${membership} set leave_until = null`",
    ],
    [
      "el SQL de otra tabla, con el esquema interpolado",
      "sql`update ${baseline}.app_config set status = 'x'`",
    ],
    ["el SQL de otra tabla con alias", "sql`update session as s set status = 'x'`"],
  ])("no cuenta %s", (_title, text) => {
    expect(writesOf(text)).toEqual([]);
  });

  it("dice el archivo y la línea de cada una, y cuenta todas las de un archivo", () => {
    const text =
      'const a = 1;\nawait db().update(membership).set({ status: "INACTIVE" });\n\nawait tx\n  .update(membership)\n  .set(ended);\n';

    expect(sample(text)).toEqual([
      { path: "muestra.ts", line: 2, write: "INACTIVE" },
      { path: "muestra.ts", line: 5, write: "unreadable" },
    ]);
  });
});
