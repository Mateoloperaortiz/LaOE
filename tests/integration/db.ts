import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appConfig } from "@/modules/system/schema";

// Deja las tablas vacías entre pruebas. `cascade` arrastra a app_config (referencia a person), así que
// los catálogos de las migraciones (cargos y configuración) se restauran después.
export async function truncateAll(): Promise<void> {
  const db = getDb();
  const config = await db.select().from(appConfig);
  await db.execute(sql`
    truncate table
      audit_log, outbox, campaign_recipient, message, campaign, email_template,
      push_subscription, notification_preference, calendar_token,
      occasion_survey_response, occasion_survey_invite, import_job, legacy_alias,
      internal_call_entry, internal_call, request, card, pipeline_stage, pipeline,
      organization_tag, organization_contact, organization, edition_registration, form_submission, form,
      permanence_decision, permanence_snapshot, manual_credit, leader_score,
      work_group_membership, work_group_evaluator, work_group, permanence_table, permanence_rule, recognition,
      point_entry, check_in, committee_participation, term_standing, assembly_requirement, occasion,
      session, otp_challenge, permission,
      document_article, document,
      interaction, task, person_tag, tag, segment, onboarding_progress,
      edition_committee, event_edition, event, media_asset, announcement, page,
      consent, appointment, membership_term,
      committee_membership, membership_event, membership, person, committee, term
    restart identity cascade
  `);
  if (config.length > 0) {
    await db
      .insert(appConfig)
      .values(config.map((row) => ({ key: row.key, value: row.value })))
      .onConflictDoNothing();
  }
}
