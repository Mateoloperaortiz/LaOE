import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schemaTables, tableNamesWritten } from "../../scripts/lib/test-suite-metrics";

// El vaciado de la base de pruebas saca su lista de tablas de PostgreSQL (ADR-124 regla 1). Una tabla
// escrita a mano en su archivo funcionaría igual y ninguna prueba de conducta lo notaría, hasta que
// la lista se desfasara como la de antes (DT-030): por eso esta prueba lee el código.

const EMPTYING = "tests/integration/db.ts";

// Los únicos nombres que el archivo puede traer: los catálogos que llenan las migraciones, que no se
// pueden deducir (spec #244). Las migraciones también llenan `page` y `event`, y esas se vacían.
const CATALOGS = ["app_config", "badge_definition", "committee_role", "macroevent_role"];

const SCHEMA = schemaTables(
  readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ path: `src/${file}`, text: readFileSync(`src/${file}`, "utf8") })),
);

/** Las tablas del esquema que el texto nombra en una cadena y no son un catálogo de migración. */
function beyondTheCatalogs(text: string): string[] {
  return tableNamesWritten({ path: EMPTYING, text }, SCHEMA).filter(
    (table) => !CATALOGS.includes(table),
  );
}

describe("los nombres de tabla escritos en el vaciado de la base de pruebas", () => {
  it("el vaciado no trae escrita ninguna tabla fuera de los catálogos que llenan las migraciones", () => {
    expect(beyondTheCatalogs(readFileSync(EMPTYING, "utf8"))).toEqual([]);
  });

  it("la búsqueda conoce las tablas del esquema y ve la que se le sume al archivo, en una lista o en una consulta", () => {
    expect(SCHEMA.size).toBeGreaterThan(100);
    expect([...SCHEMA]).toEqual(expect.arrayContaining([...CATALOGS, "person", "point_entry"]));
    const text = readFileSync(EMPTYING, "utf8");
    expect(beyondTheCatalogs(`${text}\nconst MORE = ["person", "committee_role"];`)).toEqual([
      "person",
    ]);
    expect(
      beyondTheCatalogs(
        `${text}\nawait db.execute(sql\`delete from point_entry where id = \${id}\`);`,
      ),
    ).toEqual(["point_entry"]);
  });
});
