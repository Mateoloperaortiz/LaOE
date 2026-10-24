import { existsSync, readdirSync, readFileSync } from "node:fs";
import { is, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { type Db, getDb } from "@/db/client";
import { logger } from "@/shared/log";
import {
  type AppliedMigration,
  compareJournalWithApplied,
  findSkippedByMigrator,
  lastAppliedMark,
  readJournalMigrations,
} from "./migration-journal";

// Índices que db:release exige (ADR-032, ADR-079). Salen del esquema los únicos, porque el dominio
// traduce sus violaciones por nombre (src/db/errors.ts), y los GIN, porque la búsqueda depende de ellos:
// uno declarado que no exista en la base es un despliegue roto. Los GIN de pg_trgm viven en una
// migración custom, fuera del esquema, y por eso se listan a mano.
const CUSTOM_INDEXES = [
  "person_full_name_trgm_idx",
  "occasion_title_trgm_idx",
  "organization_name_trgm_idx",
];

/**
 * Índices únicos y GIN de cada `src/modules/<módulo>/schema.ts`, los mismos archivos de
 * drizzle.config.ts. En la imagen (ADR-141) los esquemas no viajan: la lista llega precalculada
 * en `REQUIRED_INDEXES_FILE`, generada al construir con esta misma función, y una lista inválida
 * rompe el release en vez de dejarlo sin exigencias.
 */
export async function schemaRequiredIndexes(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string[]> {
  const precomputed = env.REQUIRED_INDEXES_FILE;
  if (precomputed) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(precomputed, "utf8"));
    } catch {
      throw new Error(`REQUIRED_INDEXES_FILE no se pudo leer como JSON: ${precomputed}`);
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((name) => typeof name === "string" && name.length > 0)
    ) {
      throw new Error(
        `REQUIRED_INDEXES_FILE debe ser una lista no vacía de nombres: ${precomputed}`,
      );
    }
    return [...new Set(parsed)].sort();
  }
  const modulesDir = new URL("../../src/modules/", import.meta.url);
  const names = new Set<string>();
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const schemaFile = new URL(`${entry.name}/schema.ts`, modulesDir);
    if (!existsSync(schemaFile)) {
      continue;
    }
    const exported: Record<string, unknown> = await import(schemaFile.href);
    for (const value of Object.values(exported)) {
      if (!is(value, PgTable)) {
        continue;
      }
      for (const index of getTableConfig(value).indexes) {
        if (!index.config.unique && index.config.method !== "gin") {
          continue;
        }
        if (!index.config.name) {
          throw new Error(`Índice exigido sin nombre en ${entry.name}/schema.ts`);
        }
        names.add(index.config.name);
      }
    }
  }
  return [...names].sort();
}

const REQUIRED_EXTENSIONS = ["pg_trgm"];

/** De dónde salen las migraciones y dónde las registra el migrador. */
type MigrationTarget = {
  migrationsFolder: string;
  migrationsSchema: string;
  migrationsTable: string;
};

// El esquema y la tabla son los que Drizzle usa si no se le dice nada.
const DEFAULT_TARGET: MigrationTarget = {
  migrationsFolder: "drizzle",
  migrationsSchema: "drizzle",
  migrationsTable: "__drizzle_migrations",
};

/** Las filas de la tabla de migraciones. En una base vacía la tabla todavía no existe: no hay ninguna, y no la crea. */
async function readAppliedMigrations(db: Db, target: MigrationTarget): Promise<AppliedMigration[]> {
  const exists = await db.execute(
    sql`select 1 from pg_tables where schemaname = ${target.migrationsSchema} and tablename = ${target.migrationsTable}`,
  );
  if (exists.rows.length === 0) {
    return [];
  }
  const table = sql`${sql.identifier(target.migrationsSchema)}.${sql.identifier(target.migrationsTable)}`;
  const applied = await db.execute<{ hash: string; created_at: string | null }>(
    sql`select hash, created_at from ${table}`,
  );
  return applied.rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) }));
}

// La guarda sabe qué entradas no tienen registro y cuál es la última marca aplicada, no por qué: una rama
// que se mezcló tarde o una base local que viene de otra rama dan lo mismo. Por eso van los dos remedios.
const UNAPPLIED_REMEDIES =
  "En un entorno desplegado, volvé a generarlas para que su marca sea posterior; en local, después de cambiar de rama, corré npm run db:reset (docs/15-runbook.md, «Migraciones que db:release no aplicó»).";

/**
 * Aplica las migraciones pendientes y verifica el diario, los índices y las extensiones. Nunca hace seed.
 * Sin argumentos usa la carpeta `drizzle` y la tabla de Drizzle; una prueba puede pasar las suyas.
 *
 * El diario se compara con la tabla de migraciones dos veces (ADR-117). El migrador lee solo la fila de
 * mayor `created_at` y aplica las entradas con un `when` posterior: una sin registro y con una marca
 * menor o igual no corre ni queda registrada, y no hay error. Antes de migrar, si hay alguna así, falla
 * sin tocar la base: las que sí se podían aplicar tampoco corren. Después, cada entrada tiene que tener
 * su registro.
 */
export async function applyMigrationsAndVerify(
  overrides: Partial<MigrationTarget> = {},
): Promise<void> {
  const target = { ...DEFAULT_TARGET, ...overrides };
  const db = getDb();
  const journal = readJournalMigrations(target.migrationsFolder);

  const before = await readAppliedMigrations(db, target);
  const skipped = findSkippedByMigrator(journal, before);
  if (skipped.length > 0) {
    throw new Error(
      `Entradas del diario sin registro y con una marca (\`when\`) que no supera la de la última aplicada (${lastAppliedMark(before)}): ${skipped.join(", ")}. El migrador solo aplica las de marca posterior, así que db:release no migró nada. ${UNAPPLIED_REMEDIES}`,
    );
  }

  await migrate(db, target);

  const after = await readAppliedMigrations(db, target);
  const { missing, changed } = compareJournalWithApplied(journal, after);
  if (missing.length > 0) {
    throw new Error(
      `Entradas del diario que siguen sin registro después de migrar: ${missing.join(", ")}. Marca (\`when\`) de la última aplicada: ${lastAppliedMark(after) ?? "ninguna"}. ${UNAPPLIED_REMEDIES}`,
    );
  }
  if (changed.length > 0) {
    // No tumba el despliegue: la base conserva lo que corrió, y el archivo pudo cambiar solo de formato.
    logger.warn(
      { migrations: changed },
      "migraciones ya aplicadas cuyo archivo cambió después: la base tiene lo que corrió entonces",
    );
  }

  const indexes = await db.execute<{ indexname: string }>(
    sql`select indexname from pg_indexes where schemaname = 'public'`,
  );
  const present = new Set(indexes.rows.map((row) => row.indexname));
  const required = [...(await schemaRequiredIndexes()), ...CUSTOM_INDEXES];
  const missingIndexes = required.filter((name) => !present.has(name));

  const extensions = await db.execute<{ extname: string }>(sql`select extname from pg_extension`);
  const installed = new Set(extensions.rows.map((row) => row.extname));
  const missingExtensions = REQUIRED_EXTENSIONS.filter((name) => !installed.has(name));

  if (missingIndexes.length > 0 || missingExtensions.length > 0) {
    throw new Error(
      `La base no cumple el esquema. Índices faltantes: ${missingIndexes.join(", ") || "ninguno"}. Extensiones faltantes: ${missingExtensions.join(", ") || "ninguna"}.`,
    );
  }
  logger.info(
    { migrations: journal.length, indexes: required.length, extensions: REQUIRED_EXTENSIONS },
    "migraciones aplicadas y esquema verificado",
  );
}
