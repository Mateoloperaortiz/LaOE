import { describe, expect, it } from "vitest";
import {
  insertTargets,
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
  const racing = (title: string, crossing = "") => `it("${title}", async () => { ${crossing} });`;

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

  it("no cuenta el archivo que llama a warmPool ni el que llama a un ayudante de candados", () => {
    const files = [
      {
        path: "a.test.ts",
        text: `import { warmPool } from "../helpers/pool";\n${racing("dos altas a la vez", "await warmPool();")}`,
      },
      {
        path: "b.test.ts",
        text: `import { holdCommand } from "../helpers/locks";\n${racing("dos altas a la vez", "await holdCommand(actor, command);")}`,
      },
      { path: "c.test.ts", text: racing("dos altas a la vez") },
    ];

    expect(unguardedConcurrencyTests(files)).toEqual({ tests: 1, files: 1 });
  });

  it("absuelve la llamada a cada ayudante de candados que retiene, ordena o pregunta por la cola", () => {
    const helpers = [
      "holdTransaction",
      "holdCommand",
      "firstThenSecond",
      "whileHeld",
      "heldThenSettled",
      "waitingOn",
      "waitingForLock",
    ];

    for (const helper of helpers) {
      const text = `import { ${helper} } from "../helpers/locks";\n${racing("dos altas a la vez", `await ${helper}();`)}`;

      expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }]), helper).toEqual({
        tests: 0,
        files: 0,
      });
    }
  });

  it("absuelve la llamada por el nombre local con que el archivo importa el ayudante", () => {
    const text = `import { warmPool as abrir } from "../helpers/pool";\n${racing("dos altas a la vez", "await abrir();")}`;

    expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }])).toEqual({
      tests: 0,
      files: 0,
    });
  });

  it("no absuelve al archivo que importa un ayudante y no lo llama", () => {
    const imports = [
      'import { warmPool } from "../helpers/pool";',
      'import { firstThenSecond, holdCommand } from "../helpers/locks";',
      'import "../helpers/locks";',
      'import type { Held } from "../helpers/locks";',
    ];

    for (const line of imports) {
      const text = `${line}\n${racing("dos altas a la vez")}`;

      expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }]), line).toEqual({
        tests: 1,
        files: 1,
      });
    }
  });

  it("no absuelve la llamada a lo que no fuerza un cruce, ni la que el trinquete no reconoce", () => {
    const texts = [
      // Salen del módulo de los candados y no retienen ni ordenan nada.
      `import { outcome } from "../helpers/locks";\n${racing("dos altas a la vez", "outcome(result);")}`,
      `import { deferred } from "../helpers/locks";\n${racing("dos altas a la vez", "deferred();")}`,
      `import { backendPid } from "../helpers/locks";\n${racing("dos altas a la vez", "await backendPid(tx);")}`,
      // Un warmPool que no es el de los ayudantes.
      `import { warmPool } from "./fixtures";\n${racing("dos altas a la vez", "await warmPool();")}`,
      `const warmPool = async () => {};\n${racing("dos altas a la vez", "await warmPool();")}`,
      // Formas que no se siguen: caen hacia pedir una excepción.
      `import * as locks from "../helpers/locks";\n${racing("dos altas a la vez", "await locks.holdCommand(actor, command);")}`,
      `import { warmPool } from "../helpers/pool.ts";\n${racing("dos altas a la vez", "await warmPool();")}`,
      `import { warmPool } from "../helpers/pool";\nbeforeEach(warmPool);\n${racing("dos altas a la vez")}`,
    ];

    for (const text of texts) {
      expect(unguardedConcurrencyTests([{ path: "a.test.ts", text }]), text).toEqual({
        tests: 1,
        files: 1,
      });
    }
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

  it("dice de qué archivo es cada una y con qué título, en el orden en que se le pasan", () => {
    const files = [
      { path: "b.test.ts", text: `${racing("dos altas a la vez")}\n${racing("un alta sola")}` },
      {
        path: "c.test.ts",
        text: `import { warmPool } from "../helpers/pool";\n${racing("dos giros a la vez", "await warmPool();")}`,
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

describe("insertTargets", () => {
  // El nombre que un SQL arma: va aparte para que la cadena del caso no parezca una plantilla rota.
  const TABLE = "$".concat("{table}");
  const files = [
    {
      path: "tests/integration/a.test.ts",
      text: [
        "await db().insert(person).values({});",
        "await tx",
        "  .insert(",
        "    pointEntry,",
        "  )",
        "  .values(entry);",
        "await db().execute(sql`insert into point_entry (id) values ('a')`);",
        'await client.query(`INSERT INTO probe."Tabla Rara" VALUES (1)`);',
        `await db().execute(sql.raw(\`insert into public.${TABLE} select 1\`));`,
        `await db().execute(sql.raw(\`insert into "${TABLE}" (id) values (1)\`));`,
      ].join("\n"),
    },
  ];

  it("nombra lo que escribe cada insert: la tabla de un .insert( y, con «into», la de un SQL crudo, sin comillas y con <…> donde el SQL arma el nombre", () => {
    expect(insertTargets(files)).toEqual([
      { path: "tests/integration/a.test.ts", target: "person", line: 1 },
      { path: "tests/integration/a.test.ts", target: "pointEntry", line: 3 },
      { path: "tests/integration/a.test.ts", target: "into point_entry", line: 7 },
      { path: "tests/integration/a.test.ts", target: "into probe.Tabla Rara", line: 8 },
      { path: "tests/integration/a.test.ts", target: "into public.<table>", line: 9 },
      { path: "tests/integration/a.test.ts", target: "into <table>", line: 10 },
    ]);
  });
});
