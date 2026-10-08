import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareJournalWithApplied,
  findSkippedByMigrator,
  lastAppliedMark,
} from "../../scripts/lib/migration-journal";

const row = (createdAt: number, hash: string) => ({ createdAt, hash });

describe("diario contra registro de migraciones (ADR-117)", () => {
  const journal = [
    { tag: "0000_primera", when: 100, hash: "h-primera" },
    { tag: "0001_tercera", when: 300, hash: "h-tercera" },
    { tag: "0002_tardia", when: 200, hash: "h-tardia" },
  ];
  const allApplied = [row(100, "h-primera"), row(300, "h-tercera"), row(200, "h-tardia")];

  it("no encuentra nada cuando cada entrada tiene su registro", () => {
    expect(compareJournalWithApplied(journal, allApplied)).toEqual({ missing: [], changed: [] });
  });

  it("nombra la entrada sin registro: la que el migrador se saltó", () => {
    const applied = [row(100, "h-primera"), row(300, "h-tercera")];
    expect(compareJournalWithApplied(journal, applied)).toEqual({
      missing: ["0002_tardia"],
      changed: [],
    });
  });

  it("nombra todas las entradas en una base sin registros", () => {
    expect(compareJournalWithApplied(journal, []).missing).toEqual([
      "0000_primera",
      "0001_tercera",
      "0002_tardia",
    ]);
  });

  it("una entrada con la misma marca que la última aplicada también falta", () => {
    const twin = { tag: "0003_gemela", when: 300, hash: "h-gemela" };
    expect(compareJournalWithApplied([...journal, twin], allApplied)).toEqual({
      missing: ["0003_gemela"],
      changed: [],
    });
  });

  it("entre dos entradas con la misma marca, el hash dice cuál es la que falta", () => {
    const twin = { tag: "0003_gemela", when: 300, hash: "h-gemela" };
    const applied = [row(100, "h-primera"), row(200, "h-tardia"), row(300, "h-gemela")];
    expect(compareJournalWithApplied([...journal, twin], applied)).toEqual({
      missing: ["0001_tercera"],
      changed: [],
    });
  });

  it("una fila de más no es ni un faltante ni un cambio", () => {
    const applied = [...allApplied, row(100, "h-primera"), row(50, "h-retirada")];
    expect(compareJournalWithApplied(journal, applied)).toEqual({ missing: [], changed: [] });
  });

  it("la misma marca con otro hash es un archivo que cambió, no un faltante", () => {
    const applied = [row(100, "h-de-antes"), row(300, "h-tercera"), row(200, "h-tardia")];
    expect(compareJournalWithApplied(journal, applied)).toEqual({
      missing: [],
      changed: ["0000_primera"],
    });
  });

  it("una fila con otro hash sirve para una sola de dos entradas con su marca: la otra falta", () => {
    const twin = { tag: "0003_gemela", when: 300, hash: "h-gemela" };
    const applied = [row(100, "h-primera"), row(300, "h-de-antes"), row(200, "h-tardia")];
    expect(compareJournalWithApplied([...journal, twin], applied)).toEqual({
      missing: ["0003_gemela"],
      changed: ["0001_tercera"],
    });
  });
});

// Lo que `db:release` mira antes de migrar: de las entradas sin registro, el migrador aplica las de una
// marca posterior a la de la última aplicada y se salta las demás sin avisar.
describe("entradas que el migrador no va a aplicar (ADR-117)", () => {
  const journal = [
    { tag: "0000_primera", when: 100, hash: "h-primera" },
    { tag: "0001_tercera", when: 300, hash: "h-tercera" },
    { tag: "0002_tardia", when: 200, hash: "h-tardia" },
    { tag: "0003_nueva", when: 400, hash: "h-nueva" },
  ];
  const applied = [row(100, "h-primera"), row(300, "h-tercera")];

  it("en una base sin registros no hay ninguna: el migrador aplica el diario entero", () => {
    expect(findSkippedByMigrator(journal, [])).toEqual([]);
    expect(lastAppliedMark([])).toBeNull();
  });

  it("nombra la entrada sin registro más vieja que la última aplicada, y no la pendiente más nueva", () => {
    expect(findSkippedByMigrator(journal, applied)).toEqual(["0002_tardia"]);
    expect(lastAppliedMark(applied)).toBe(300);
  });

  it("una entrada sin registro con la misma marca que la última aplicada también se salta", () => {
    const twin = { tag: "0004_gemela", when: 300, hash: "h-gemela" };
    expect(findSkippedByMigrator([...journal, twin], applied)).toEqual([
      "0002_tardia",
      "0004_gemela",
    ]);
  });

  it("no hay ninguna cuando las entradas sin registro son todas más nuevas que la última aplicada", () => {
    expect(findSkippedByMigrator(journal, [...applied, row(200, "h-tardia")])).toEqual([]);
  });

  it("la última aplicada es la fila de mayor marca, no la que se insertó de última", () => {
    const outOfOrder = [...applied, row(200, "h-tardia")];
    const between = { tag: "0004_intermedia", when: 250, hash: "h-intermedia" };
    expect(lastAppliedMark(outOfOrder)).toBe(300);
    expect(findSkippedByMigrator([...journal, between], outOfOrder)).toEqual(["0004_intermedia"]);
  });
});

// La que falla en CI cuando una mezcla deja el diario desordenado: una entrada con una marca que no
// supera a la anterior es justo la que el migrador se salta en una base que ya aplicó la otra (ADR-117).
describe("diario de migraciones del repo", () => {
  const folder = new URL("../../drizzle/", import.meta.url);
  const journal: { entries: { idx: number; when: number; tag: string }[] } = JSON.parse(
    readFileSync(new URL("meta/_journal.json", folder), "utf8"),
  );
  const entries = journal.entries;

  it("numera las entradas de corrido desde 0", () => {
    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
  });

  it("tiene marcas de tiempo estrictamente crecientes", () => {
    const notAfterPrevious = entries.filter((entry, index) => {
      const previous = entries[index - 1];
      return previous !== undefined && entry.when <= previous.when;
    });
    expect(notAfterPrevious.map((entry) => entry.tag)).toEqual([]);
  });

  it("tiene un archivo .sql por entrada y una entrada por archivo", () => {
    const files = readdirSync(folder).filter((name) => name.endsWith(".sql"));
    expect(files.sort()).toEqual(entries.map((entry) => `${entry.tag}.sql`).sort());
  });
});
