import { and, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { badgeDefinition } from "@/modules/participation/schema";
import { clearConfigCache } from "@/modules/system/domain/config";
import { appConfig } from "@/modules/system/schema";

// Deja las tablas vacías entre pruebas. El vaciado alcanza a app_config y badge_definition
// (referencias a person), así que los catálogos de las migraciones se restauran después.
// Los valores de la migración 0030: una prueba que activa gamificación no debe filtrarlo a la siguiente.
const GAMIFICATION_SEED: Record<string, unknown> = {
  "gamification.enabled": false,
  "gamification.caps": { daily: 20, weekly: 60 },
  "gamification.defaults": { trivia: 5, presential: 10, evidence: 10, passPercent: 80 },
};

// Claves que ninguna migración siembra y que una prueba puede dejar escritas (ADR-115 reglas 5 y 6):
// no se restauran, o el margen o el corte por cuota de una prueba le quedarían a la siguiente.
const UNSEEDED = new Set([
  "campaigns.transactionalReserve",
  "campaigns.quotaCut",
  "campaigns.quotaExhaustedAt",
]);

// Las tablas que se vacían entre pruebas. A estas se les suma, al correr, toda tabla que las referencie
// por clave foránea (app_config, badge_definition, los retos, las sanciones…): es lo que arrastraba el
// `cascade` del truncado. Quedan fuera los catálogos que nadie de esta lista referencia hacia abajo y
// que siembran las migraciones: committee_role y macroevent_role.
const EMPTIED = [
  "competition_power_use",
  "competition_power_grant",
  "competition_credit_entry",
  "competition_bet",
  "competition_market_option",
  "competition_market",
  "competition_announcement",
  "competition_point_entry",
  "competition_extra_jury_score",
  "competition_extra",
  "competition_result",
  "competition_matchup",
  "competition_rotation",
  "competition_support",
  "competition_staff",
  "competition_base",
  "competition_team_captain",
  "competition_team",
  "competition",
  "budget_transfer",
  "budget_expense",
  "budget_prerequest",
  "event_approval",
  "budget_line",
  "committee_budget",
  "audit_log",
  "outbox",
  "campaign_recipient",
  "message",
  "campaign",
  "email_template",
  "push_subscription",
  "notification_preference",
  "calendar_token",
  "carnet_token",
  "wallet_pass",
  "occasion_survey_response",
  "occasion_survey_invite",
  "import_job",
  "legacy_alias",
  "internal_call_entry",
  "internal_call",
  "request",
  "card",
  "pipeline_stage",
  "pipeline",
  "organization_tag",
  "organization_contact",
  "organization",
  "edition_registration",
  "form_submission",
  "form",
  "permanence_decision",
  "permanence_snapshot",
  "manual_credit",
  "leader_score",
  "work_group_membership",
  "work_group_evaluator",
  "work_group",
  "permanence_table",
  "permanence_rule",
  "recognition",
  "point_entry",
  "panal_word",
  "panal_game",
  "sudoku_run",
  "game2048_run",
  "wordle_attempt",
  "wordle_game",
  "check_in",
  "committee_participation",
  "term_standing",
  "assembly_requirement",
  "occasion",
  "session",
  "otp_challenge",
  "permission",
  "credential",
  "access_grant",
  "login_attempt",
  "document_article",
  "document",
  "interaction",
  "task",
  "person_tag",
  "tag",
  "segment",
  "onboarding_progress",
  "edition_committee",
  "event_edition",
  "event",
  "media_asset",
  "announcement",
  "page",
  "consent",
  "appointment",
  "membership_term",
  "committee_role_assignment",
  "committee_membership",
  "membership_event",
  "membership",
  "person",
  "committee",
  "term",
];

let emptied: string[] | null = null;

/** La lista escrita más lo que la referencia, directa o indirectamente. Se calcula una vez por archivo. */
async function tablesToEmpty(): Promise<string[]> {
  if (emptied) {
    return emptied;
  }
  const { rows } = await getDb().execute<{ child: string; parent: string }>(sql`
    select conrelid::regclass::text as child, confrelid::regclass::text as parent
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace
  `);
  const reached = new Set(EMPTIED);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { child, parent } of rows) {
      if (reached.has(parent) && !reached.has(child)) {
        reached.add(child);
        grew = true;
      }
    }
  }
  emptied = [...reached].sort();
  return emptied;
}

export async function truncateAll(): Promise<void> {
  const db = getDb();
  const config = (await db.select().from(appConfig)).filter((row) => !UNSEEDED.has(row.key));
  // Solo el catálogo sembrado: las ediciones especiales de una prueba referencian
  // ocasiones/retos que el vaciado borra y no deben sobrevivir.
  const badges = await db
    .select()
    .from(badgeDefinition)
    .where(
      and(isNull(badgeDefinition.specialChallengeId), isNull(badgeDefinition.specialOccasionId)),
    );
  const tables = await tablesToEmpty();
  // Borrar y no truncar: `TRUNCATE` le crea a PostgreSQL un archivo nuevo por tabla, por TOAST y por
  // índice en cada prueba, y la suite le dejaba al checkpoint siguiente cerca de un millón (DT-188).
  // Todo en una transacción. Sin los disparadores de las claves foráneas el orden entre tablas no
  // importa (el PostgreSQL de pruebas usa un superusuario, como la E2E), y el candado es el que tomaba
  // `TRUNCATE`, así que sigue esperando a lo que una prueba anterior dejó escribiendo. Una sola
  // sentencia borra todas y devuelve cuáles tenían filas.
  const used = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    await tx.execute(sql.raw(`lock table ${tables.join(", ")} in access exclusive mode`));
    const { rows } = await tx.execute<{ name: string }>(
      sql.raw(`with ${tables.map((table, index) => `d${index} as (delete from ${table} returning 1)`).join(", ")}
        ${tables.map((table, index) => `select '${table}' as name where exists (select 1 from d${index})`).join(" union all ")}`),
    );
    return rows.map((row) => row.name);
  });
  // `VACUUM` devuelve a cero páginas las tablas que tenían filas, sin darles un archivo nuevo: las
  // filas de la prueba siguiente vuelven a quedar en el orden en que se insertan, como tras un truncado.
  // Sin esto el orden físico deja de coincidir con el de inserción y una prueba que lee sin `order by`
  // se vuelve inestable.
  if (used.length > 0) {
    await db.execute(sql.raw(`vacuum ${used.join(", ")}`));
  }
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
