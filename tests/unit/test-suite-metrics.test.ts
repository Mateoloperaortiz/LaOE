import { describe, expect, it } from "vitest";
import {
  looseInserts,
  tableNamesWritten,
  unguardedConcurrencyTests,
  unguardedConcurrencyTitles,
} from "../../scripts/lib/test-suite-metrics";

// Las tres medidas de la base de pruebas que imprime `npm run audit:metrics` (spec #244): cada una
// cuenta sobre el texto de los archivos, así que acá se le pasa el texto.

const TABLES = new Set(["person", "term", "app_config", "committee_role"]);

describe("los nombres de tabla escritos en el vaciado", () => {
  it("cuenta la tabla nombrada en una cadena, sea de una lista o de una consulta", () => {
    const text = [
      'const EMPTIED = ["person", "term"];',
      "const kept = sql`select 1 from pg_tables where tablename <> 'app_config'`;",
      `const more = \`delete from \${table} where 'committee_role' = $1\`;`,
    ].join("\n");

    expect(tableNamesWritten({ path: "db.ts", text }, TABLES)).toEqual([
      "app_config",
      "committee_role",
      "person",
      "term",
    ]);
  });

  it("cuenta una vez la tabla que aparece varias", () => {
    const text = 'const a = ["person"]; const b = "person";';

    expect(tableNamesWritten({ path: "db.ts", text }, TABLES)).toEqual(["person"]);
  });

  it("no cuenta el nombre que está en un comentario, en un import ni el que es un identificador", () => {
    const text = [
      'import { helper } from "./person";',
      "// committee_role y term quedan fuera",
      "/** person también */",
      'const term = person.term ?? "nada";',
    ].join("\n");

    expect(tableNamesWritten({ path: "db.ts", text }, TABLES)).toEqual([]);
  });

  it("no cuenta la palabra que solo contiene el nombre de una tabla", () => {
    const text =
      'const keys = ["person_id", "terms", "long-term", "termId", "session_replication_role"];';

    expect(
      tableNamesWritten({ path: "db.ts", text }, new Set(["person", "term", "session"])),
    ).toEqual([]);
  });
});

describe("los insert sueltos", () => {
  it("cuenta por separado las llamadas a insert y el SQL crudo, en mayúsculas o partido en dos líneas", () => {
    const files = [
      { path: "a.test.ts", text: "await db.insert(person).values(a);\nawait tx\n  .insert(term);" },
      {
        path: "b.test.ts",
        text: 'await client.query("INSERT INTO person (id) values ($1)");\nsql`insert\n  into term`;',
      },
    ];

    expect(looseInserts(files)).toEqual({ calls: 2, raw: 2 });
  });

  it("no cuenta lo que no escribe una fila", () => {
    const files = [{ path: "a.test.ts", text: "list.insertAt(0); const insertInto = 1;" }];

    expect(looseInserts(files)).toEqual({ calls: 0, raw: 0 });
  });
});

describe("las pruebas de simultaneidad sin ayudante", () => {
  const racing = (title: string) => `it("${title}", async () => {});`;

  it("cuenta la prueba que nombra una simultaneidad en el título, con cualquiera de sus palabras", () => {
    const text = [
      racing("dos altas simultáneas dejan una"),
      racing("Simultáneamente no se pisan"),
      racing("dos cierres a la vez"),
      racing("dos pagos al mismo tiempo"),
      racing("lecturas concurrentes"),
      racing("dos lotes en paralelo"),
      racing("la carrera entre el alta y la baja"),
      racing("dos bajas al tiempo"),
      racing("dos giros simultaneos, sin la tilde"),
      racing("un alta sola"),
    ].join("\n");

    expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }])).toEqual({
      tests: 9,
      files: 1,
    });
  });

  it("cuenta el título que va en la línea siguiente, el de una plantilla y el de it.each y test", () => {
    const text = [
      "it(\n  'dos altas a la vez',\n  async () => {},\n);",
      "it(`dos bajas a la vez`, async () => {});",
      'it.each([1, 2])("con %s pedidos en paralelo", async () => {});',
      'test("dos giros a la vez", async () => {});',
    ].join("\n");

    expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }])).toEqual({
      tests: 4,
      files: 1,
    });
  });

  it("no cuenta el archivo que importa warmPool ni el que importa los ayudantes de candados", () => {
    const files = [
      {
        path: "a.test.ts",
        text: `import { warmPool } from "../helpers/pool";\n${racing("dos altas a la vez")}`,
      },
      {
        path: "b.test.ts",
        text: `import { holdCommand } from "../helpers/locks";\n${racing("dos altas a la vez")}`,
      },
      { path: "c.test.ts", text: racing("dos altas a la vez") },
    ];

    expect(unguardedConcurrencyTests(files)).toEqual({ tests: 1, files: 1 });
  });

  it("no absuelve al archivo que nombra los ayudantes en un comentario o en una cadena y no los importa", () => {
    const text = [
      "// Sin warmPool: ver ../helpers/locks",
      'const hint = "warmPool y tests/helpers/locks";',
      racing("dos altas a la vez"),
    ].join("\n");

    expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }])).toEqual({
      tests: 1,
      files: 1,
    });
  });

  it("absuelve por el import: warmPool con otro nombre local y un tipo de los ayudantes de candados", () => {
    const files = [
      {
        path: "a.test.ts",
        text: `import { warmPool as abrir } from "../helpers/pool";\n${racing("dos altas a la vez")}`,
      },
      {
        path: "b.test.ts",
        text: `import type { Held } from "../helpers/locks";\n${racing("dos altas a la vez")}`,
      },
    ];

    expect(unguardedConcurrencyTests(files)).toEqual({ tests: 0, files: 0 });
  });

  it("dice de qué archivo es cada una y con qué título, en el orden en que se le pasan", () => {
    const files = [
      { path: "b.test.ts", text: `${racing("dos altas a la vez")}\n${racing("un alta sola")}` },
      {
        path: "c.test.ts",
        text: `import { warmPool } from "../helpers/pool";\n${racing("dos giros a la vez")}`,
      },
      {
        path: "a.test.ts",
        text: `${racing("dos bajas en paralelo")}\n${racing("dos bajas en paralelo")}`,
      },
    ];

    expect(unguardedConcurrencyTitles(files)).toEqual([
      { path: "b.test.ts", title: "dos altas a la vez" },
      { path: "a.test.ts", title: "dos bajas en paralelo" },
      { path: "a.test.ts", title: "dos bajas en paralelo" },
    ]);
    expect(unguardedConcurrencyTests(files)).toEqual({ tests: 3, files: 2 });
  });

  it("no cuenta el describe, el comentario ni la cadena que no es el título de una prueba", () => {
    const text = [
      'describe("dos altas a la vez", () => {',
      "  // dos altas a la vez",
      '  it("deja una sola", async () => { expect("a la vez").toBe("a la vez"); });',
      "});",
    ].join("\n");

    expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }])).toEqual({
      tests: 0,
      files: 0,
    });
  });
});
