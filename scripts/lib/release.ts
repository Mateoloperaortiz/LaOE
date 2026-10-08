import { existsSync, readdirSync } from "node:fs";
import { is, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { type Db, getDb } from "@/db/client";
import { logger } from "@/shared/log";
import { compareJournalWithApplied, readJournalMigrations } from "./migration-journal";

// Índices que db:release exige (ADR-032, ADR-079). Salen del esquema los únicos, porque el dominio
// traduce sus violaciones por nombre (src/db/errors.ts), y los GIN, porque la búsqueda depende de ellos:
// uno declarado que no exista en la base es un despliegue roto. Los GIN de pg_trgm viven en una
// migración custom, fuera del esquema, y por eso se listan a mano.
const CUSTOM_INDEXES = [
  "person_full_name_trgm_idx",
  "occasion_title_trgm_idx",
  "organization_name_trgm_idx",
];

/** Índices únicos y GIN de cada `src/modules/<módulo>/schema.ts`, los mismos archivos de drizzle.config.ts. */
export async function schemaRequiredIndexes(): Promise<string[]> {
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

/**
 * Falla si alguna entrada del diario quedó sin su registro (ADR-117). El migrador lee solo la última
 * fila de su tabla y aplica las entradas con un `when` posterior: una más vieja que llega después, por
 * una rama que tardó en mezclarse, no corre ni queda registrada, y no hay error. Devuelve cuántas comprobó.
 */
async function verifyJournalApplied(db: Db, target: MigrationTarget): Promise<number> {
  const table = sql`${sql.identifier(target.migrationsSchema)}.${sql.identifier(target.migrationsTable)}`;
  const applied = await db.execute<{ hash: string; created_at: string | null }>(
    sql`select hash, created_at from ${table}`,
  );
  const journal = readJournalMigrations(target.migrationsFolder);
  const { missing, changed } = compareJournalWithApplied(
    journal,
    applied.rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
  );
  if (missing.length > 0) {
    throw new Error(
      `Migraciones del diario que no quedaron aplicadas: ${missing.join(", ")}. El migrador solo aplica las que tienen una marca de tiempo (\`when\`) posterior a la última aplicada, y estas no la tienen. Volvé a generarlas para que su marca de tiempo sea posterior a la última aplicada (docs/15-runbook.md, «Migraciones que db:release no aplicó»).`,
    );
  }
  if (changed.length > 0) {
    // No tumba el despliegue: la base conserva lo que corrió, y el archivo pudo cambiar solo de formato.
    logger.warn(
      { migrations: changed },
      "migraciones ya aplicadas cuyo archivo cambió después: la base tiene lo que corrió entonces",
    );
  }
  return journal.length;
}

/**
 * Aplica las migraciones pendientes y verifica el diario, los índices y las extensiones. Nunca hace seed.
 * Sin argumentos usa la carpeta `drizzle` y la tabla de Drizzle; una prueba puede pasar las suyas.
 */
export async function applyMigrationsAndVerify(
  overrides: Partial<MigrationTarget> = {},
): Promise<void> {
  const target = { ...DEFAULT_TARGET, ...overrides };
  const db = getDb();
  await migrate(db, target);
  const migrations = await verifyJournalApplied(db, target);

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
    { migrations, indexes: required.length, extensions: REQUIRED_EXTENSIONS },
    "migraciones aplicadas y esquema verificado",
  );
}
