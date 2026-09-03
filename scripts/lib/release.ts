import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "@/db/client";
import { logger } from "@/shared/log";

// Índices parciales que el esquema declara y que db:release exige que existan (ADR-032).
const REQUIRED_INDEXES = [
  "person_email_unique",
  "membership_person_unique",
  "committee_membership_one_general",
  "permission_global_unique",
  "permission_committee_unique",
  "session_token_hash_unique",
  "outbox_dedupe_key_pending_unique",
  "person_full_name_trgm_idx",
  "page_slug_unique",
  "media_asset_object_key_unique",
  "event_slug_unique",
  "event_edition_event_slug_unique",
  "edition_committee_unique",
  "person_legacy_id_unique",
  "committee_legacy_id_unique",
  "consent_live_unique",
  "membership_term_person_term_unique",
  "interaction_ref_unique",
  "tag_name_unique",
  "person_tag_unique",
  "onboarding_progress_unique",
  "document_file_key_unique",
  "document_article_key_unique",
  "document_article_search_idx",
];

const REQUIRED_EXTENSIONS = ["pg_trgm"];

/** Aplica las migraciones pendientes y verifica índices y extensiones. Nunca hace seed. */
export async function applyMigrationsAndVerify(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: "drizzle" });

  const indexes = await db.execute<{ indexname: string }>(
    sql`select indexname from pg_indexes where schemaname = 'public'`,
  );
  const present = new Set(indexes.rows.map((row) => row.indexname));
  const missingIndexes = REQUIRED_INDEXES.filter((name) => !present.has(name));

  const extensions = await db.execute<{ extname: string }>(sql`select extname from pg_extension`);
  const installed = new Set(extensions.rows.map((row) => row.extname));
  const missingExtensions = REQUIRED_EXTENSIONS.filter((name) => !installed.has(name));

  if (missingIndexes.length > 0 || missingExtensions.length > 0) {
    throw new Error(
      `La base no cumple el esquema. Índices faltantes: ${missingIndexes.join(", ") || "ninguno"}. Extensiones faltantes: ${missingExtensions.join(", ") || "ninguna"}.`,
    );
  }
  logger.info(
    { indexes: REQUIRED_INDEXES.length, extensions: REQUIRED_EXTENSIONS },
    "migraciones aplicadas y esquema verificado",
  );
}
