import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";

/** Una entrada de `meta/_journal.json`, con el hash que el migrador le calcula a su archivo. */
type JournalMigration = { tag: string; when: number; hash: string };

/** Una fila de la tabla de migraciones: el migrador guarda en `created_at` el `when` de la entrada. */
type AppliedMigration = { createdAt: number; hash: string };

/** Las entradas del diario de una carpeta, leídas con el mismo lector que usa el migrador. */
export function readJournalMigrations(migrationsFolder: string): JournalMigration[] {
  const journal: { entries: { tag: string; when: number }[] } = JSON.parse(
    readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
  );
  const files = readMigrationFiles({ migrationsFolder });
  return journal.entries.map(({ tag, when }, index) => ({
    tag,
    when,
    hash: files[index]?.hash ?? "",
  }));
}

/**
 * Compara el diario con lo que la base tiene registrado (ADR-117) y devuelve los `tag` de las entradas
 * sin registro (`missing`) y de las aplicadas cuyo archivo cambió después (`changed`).
 *
 * Una entrada se empareja con una fila por su marca de tiempo: es lo que el migrador escribe y lo único
 * que mira para decidir, y no cambia si alguien edita el archivo. El hash solo desempata. Cada fila
 * sirve para una sola entrada, así que una con la marca de otra ya aplicada también falta, y las filas
 * que sobran no cuentan.
 */
export function compareJournalWithApplied(
  journal: JournalMigration[],
  applied: AppliedMigration[],
): { missing: string[]; changed: string[] } {
  const free = new Map<number, string[]>();
  for (const row of applied) {
    free.set(row.createdAt, [...(free.get(row.createdAt) ?? []), row.hash]);
  }

  // Primero las que coinciden del todo: una entrada intacta no pierde su fila con otra de su misma marca.
  const pending: JournalMigration[] = [];
  for (const entry of journal) {
    const hashes = free.get(entry.when) ?? [];
    const at = hashes.indexOf(entry.hash);
    if (at >= 0) {
      hashes.splice(at, 1);
    } else {
      pending.push(entry);
    }
  }

  const missing: string[] = [];
  const changed: string[] = [];
  for (const entry of pending) {
    const sameMark = free.get(entry.when)?.shift();
    (sameMark === undefined ? missing : changed).push(entry.tag);
  }
  return { missing, changed };
}
