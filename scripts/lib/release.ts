import { existsSync, readdirSync } from "node:fs";
import { is, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { logger } from "@/shared/log";

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

/** Aplica las migraciones pendientes y verifica índices y extensiones. Nunca hace seed. */
export async function applyMigrationsAndVerify(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: "drizzle" });

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
    { indexes: required.length, extensions: REQUIRED_EXTENSIONS },
    "migraciones aplicadas y esquema verificado",
  );
}
