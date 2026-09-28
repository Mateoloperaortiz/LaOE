import { and, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { badgeDefinition } from "@/modules/participation/schema";
import { clearConfigCache } from "@/modules/system/domain/config";
import { appConfig } from "@/modules/system/schema";

// Deja las tablas vacías entre pruebas. `cascade` arrastra a app_config y badge_definition
// (referencias a person), así que los catálogos de las migraciones se restauran después.
// Los valores de la migración 0030: una prueba que activa gamificación no debe filtrarlo a la siguiente.
const GAMIFICATION_SEED: Record<string, unknown> = {
  "gamification.enabled": false,
  "gamification.caps": { daily: 20, weekly: 60 },
  "gamification.defaults": { trivia: 5, presential: 10, evidence: 10, passPercent: 80 },
};

export async function truncateAll(): Promise<void> {
  const db = getDb();
  const config = await db.select().from(appConfig);
  // Solo el catálogo sembrado: las ediciones especiales de una prueba referencian
  // ocasiones/retos que el truncate borra y no deben sobrevivir.
  const badges = await db
    .select()
    .from(badgeDefinition)
    .where(
      and(isNull(badgeDefinition.specialChallengeId), isNull(badgeDefinition.specialOccasionId)),
    );
  await db.execute(sql`
    truncate table
      competition_credit_entry, competition_bet, competition_market_option, competition_market,
      competition_announcement, competition_point_entry, competition_extra, competition_result,
      competition_matchup, competition_rotation, competition_staff, competition_base,
      competition_team_captain, competition_team, competition,
      budget_transfer, budget_expense, budget_prerequest, event_approval, budget_line, committee_budget,
      audit_log, outbox, campaign_recipient, message, campaign, email_template,
      push_subscription, notification_preference, calendar_token, carnet_token, wallet_pass,
      occasion_survey_response, occasion_survey_invite, import_job, legacy_alias,
      internal_call_entry, internal_call, request, card, pipeline_stage, pipeline,
      organization_tag, organization_contact, organization, edition_registration, form_submission, form,
      permanence_decision, permanence_snapshot, manual_credit, leader_score,
      work_group_membership, work_group_evaluator, work_group, permanence_table, permanence_rule, recognition,
      point_entry, panal_word, panal_game, sudoku_run, game2048_run, wordle_attempt, wordle_game, check_in, committee_participation, term_standing, assembly_requirement, occasion,
      session, otp_challenge, permission, credential, access_grant, login_attempt,
      document_article, document,
      interaction, task, person_tag, tag, segment, onboarding_progress,
      edition_committee, event_edition, event, media_asset, announcement, page,
      consent, appointment, membership_term,
      committee_role_assignment, committee_membership, membership_event, membership, person, committee, term
    restart identity cascade
  `);
  if (config.length > 0) {
    await db
      .insert(appConfig)
      .values(
        config.map((row) => ({
          key: row.key,
          value:
            row.key === "privacy.policyVersion"
              ? "prueba-v1"
              : (GAMIFICATION_SEED[row.key] ?? row.value),
        })),
      )
      .onConflictDoNothing();
  }
  if (badges.length > 0) {
    await db.insert(badgeDefinition).values(badges).onConflictDoNothing();
  }
  clearConfigCache();
}
