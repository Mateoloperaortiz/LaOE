import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El libro de puntos tiene un solo escritor (ADR-119 regla 8): `ledger.ts` es el único archivo de
// `src` que inserta en `point_entry`, y por eso el único que sabe qué columna liga una entrada con
// su asistencia, su premio o su partida. Un juego que insertara por su cuenta funcionaría igual y
// ninguna prueba de conducta lo notaría: por eso esta prueba lee el código.

const LEDGER = "src/modules/participation/domain/ledger.ts";
/** Un insert a la tabla, también partido en varias líneas o con el argumento en su propio renglón. */
const INSERT = /\.insert\(\s*pointEntry\s*,?\s*\)/;

const SOURCES = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => `src/${file}`);

describe("quién escribe en el libro de puntos", () => {
  it("solo el libro inserta en point_entry: ningún juego ni otro dominio lo hace por su cuenta", () => {
    const writers = SOURCES.filter((file) => INSERT.test(readFileSync(file, "utf8")));
    expect(writers).toEqual([LEDGER]);
  });

  it("la búsqueda recorre los juegos y reconoce el insert de una línea y el partido", () => {
    expect(SOURCES).toEqual(
      expect.arrayContaining([
        "src/modules/participation/domain/wordle.ts",
        "src/modules/participation/domain/game2048.ts",
        "src/modules/participation/domain/sudoku.ts",
        "src/modules/participation/domain/panal.ts",
      ]),
    );
    expect(INSERT.test("await ctx.tx.insert(pointEntry).values({})")).toBe(true);
    expect(INSERT.test("await ctx.tx\n    .insert(\n      pointEntry,\n    )")).toBe(true);
    expect(INSERT.test("await ctx.tx\n    .insert(pointEntry)\n    .values({})")).toBe(true);
    expect(INSERT.test("ctx.tx.select().from(pointEntry)")).toBe(false);
  });
});
