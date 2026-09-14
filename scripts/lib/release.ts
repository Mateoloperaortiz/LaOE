import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "@/db/client";
import { logger } from "@/shared/log";

// Índices parciales que el esquema declara y que db:release exige que existan (ADR-032).
const REQUIRED_INDEXES = [
  "person_email_unique",
  "membership_person_unique",
  "committee_role_assignment_titular_unique",
  "committee_role_assignment_codireccion_unique",
  "committee_role_assignment_membership_role_unique",
  "permission_global_unique",
  "permission_committee_unique",
  "session_token_hash_unique",
  "credential_person_unique",
  "access_grant_token_hash_unique",
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
  "membership_term_committee_unique",
  "interaction_ref_unique",
  "tag_name_unique",
  "person_tag_unique",
  "onboarding_progress_unique",
  "document_file_key_unique",
  "document_article_key_unique",
  "document_article_search_idx",
  "occasion_public_id_unique",
  "occasion_legacy_id_unique",
  "occasion_board_election_unique",
  "occasion_runoff_unique",
  "occasion_title_trgm_idx",
  "check_in_occasion_person_unique",
  "check_in_legacy_id_unique",
  "point_entry_checkin_unique",
  "point_entry_reversal_of_unique",
  "point_entry_legacy_id_unique",
  "committee_participation_unique",
  "term_standing_term_unique",
  "assembly_requirement_unique",
  "legacy_alias_path_unique",
  // Fase 4 (ADR-036)
  "permanence_rule_general_unique",
  "permanence_rule_committee_unique",
  "permanence_table_general_unique",
  "permanence_table_committee_unique",
  "work_group_code_unique",
  "work_group_macroevent_term_unique",
  "work_group_evaluator_unique",
  "work_group_membership_unique",
  "leader_score_unique",
  "manual_credit_unique",
  "permanence_snapshot_unique",
  "permanence_decision_committee_unique",
  "permanence_decision_person_unique",
  "recognition_month_unique",
  // Fase 5 (ADR-037)
  "form_slug_unique",
  "edition_registration_unique",
  "organization_name_unique",
  "organization_name_trgm_idx",
  "organization_contact_unique",
  "organization_contact_primary_unique",
  "organization_tag_unique",
  "card_submission_unique",
  "request_pending_unique",
  "request_excuse_pending_unique",
  // Normativa 2026 (ADR-060)
  "committee_representative_role_unique",
  "committee_representative_person_unique",
  "committee_assembly_attendance_unique",
  "appointment_edition_titular_unique",
  "appointment_edition_codireccion_unique",
  "appointment_edition_person_unique",
  "committee_budget_ordinary_unique",
  "budget_prerequest_month_unique",
  "internal_call_entry_unique",
  // Fase 6 (ADR-038)
  "message_person_dedupe_unique",
  "push_subscription_endpoint_unique",
  "notification_preference_person_unique",
  "notification_preference_token_unique",
  "email_template_slug_unique",
  "campaign_recipient_unique",
  "occasion_survey_invite_unique",
  "occasion_survey_invite_token_unique",
  "calendar_token_person_unique",
  "calendar_token_token_unique",
  // Fase 8 (ADR-040)
  "carnet_token_person_unique",
  "carnet_token_token_unique",
  "wallet_pass_person_platform_unique",
  // Wordle diario (ADR-041)
  "wordle_game_person_day_unique",
  "wordle_game_answer_day_unique",
  "wordle_attempt_game_ordinal_unique",
  "wordle_attempt_game_request_unique",
  "point_entry_wordle_game_unique",
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
