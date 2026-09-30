import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor } from "@/db/tx";
import { getEnv } from "@/env";
import { getEdition } from "@/modules/events";
import { getSubmission } from "@/modules/forms";
import { getMembershipRef, isMacroeventDirector } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  competition,
  competitionAnnouncement,
  competitionBase,
  competitionExtra,
  competitionExtraCriterion,
  competitionExtraScore,
  competitionMatchup,
  competitionPointEntry,
  competitionPowerUse,
  competitionStaff,
  competitionSupport,
  competitionTeam,
  competitionTeamCaptain,
} from "../schema";
import { assertOperator, type CompetitionActor, THE_GAMES_ROLE_CODE } from "./access";
import { generateTeamCode, hashTeamCode } from "./codes-pure";
import {
  RUBRIC_MAX_SCORE,
  RUBRIC_MIN_SCORE,
  rubricPoints,
  rubricTotal,
  THE_CHALLENGE_RUBRIC,
} from "./rubric-pure";
import { extraDelta } from "./scoring-pure";

// Preparación de The Games (ADR-089): la competencia, sus equipos y códigos, bases, personal,
// anuncios, competencias extra y ajustes. Cada comando recibe el alcance `competitionId` y relee
// quién opera dentro de la transacción (ADR-072).

const day = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(1), z.literal(2)]));
const idField = z.string().trim().min(1);

/** Bloquea la competencia sin mirar su estado. */
export async function lockedCompetition(ctx: CommandContext, competitionId: string) {
  const [row] = await ctx.tx
    .select()
    .from(competition)
    .where(eq(competition.id, competitionId))
    .for("update");
  if (!row) throw new DomainError(t("T-2764"));
  return row;
}

/** Borra los capitanes de todos los equipos de la competencia (ADR-095) y dice cuántos había. */
export async function purgeCaptains(ctx: CommandContext, competitionId: string): Promise<number> {
  const teams = ctx.tx
    .select({ id: competitionTeam.id })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const removed = await ctx.tx
    .delete(competitionTeamCaptain)
    .where(inArray(competitionTeamCaptain.teamId, teams))
    .returning({ id: competitionTeamCaptain.id });
  return removed.length;
}

/** Bloquea la competencia y comprueba que todavía admite cambios. Todos los comandos la bloquean
 *  primero, así el orden de los candados es siempre el mismo. */
export async function writableCompetition(ctx: CommandContext, competitionId: string) {
  const row = await lockedCompetition(ctx, competitionId);
  if (row.status === "FINISHED" || row.status === "ARCHIVED") {
    throw new DomainError(t("T-2793"));
  }
  return row;
}

/** La competencia existe, admite cambios y el actor la opera. */
export async function openCompetition(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
) {
  const row = await writableCompetition(ctx, competitionId);
  await assertOperator(actor, competitionId, ctx.tx);
  return row;
}

/** Un objeto de la competencia; uno ajeno se responde como inexistente (ADR-072). */
async function ownedTeam(exec: Executor, competitionId: string, teamId: string) {
  const [row] = await exec
    .select()
    .from(competitionTeam)
    .where(and(eq(competitionTeam.id, teamId), eq(competitionTeam.competitionId, competitionId)))
    .limit(1);
  if (!row) throw new DomainError(t("T-2764"));
  return row;
}

// --- Competencia ---------------------------------------------------------------------------------

export const competitionInputSchema = z.object({
  editionId: idField,
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(80),
  isRehearsal: z.coerce.boolean().default(false),
});
export type CompetitionInput = z.input<typeof competitionInputSchema>;

/** Solo ADMIN crea competencias (ADR-089 regla 2). */
export async function createCompetition(
  ctx: CommandContext,
  actor: CompetitionActor,
  raw: CompetitionInput,
): Promise<{ id: string }> {
  if (!actor.isAdmin) throw new DomainError(t("T-2765"));
  const input = competitionInputSchema.parse(raw);
  if (!(await getEdition(input.editionId))) throw new DomainError(t("T-2764"), "editionId");
  try {
    const [row] = await ctx.tx.insert(competition).values(input).returning({ id: competition.id });
    if (!row) throw new Error("competition insert");
    await ctx.audit({
      action: "competition.create",
      entityType: "competition",
      entityId: row.id,
      after: input,
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "competition_slug_unique")) {
      throw new DomainError(t("T-2798"), "slug");
    }
    throw error;
  }
}

export const competitionSettingsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  firstDayOn: z.iso.date().nullable().default(null),
  secondDayOn: z.iso.date().nullable().default(null),
  registrationFormId: z.string().trim().min(1).nullable().default(null),
  bettingEnabled: z.coerce.boolean().default(false),
  startingCredits: z.coerce.number().int().min(0).max(1_000_000).nullable().default(null),
  allowSelfBet: z.coerce.boolean().default(false),
});
export type CompetitionSettingsInput = z.input<typeof competitionSettingsSchema>;

export async function updateCompetitionSettings(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: CompetitionSettingsInput,
): Promise<void> {
  const before = await openCompetition(ctx, actor, competitionId);
  const input = competitionSettingsSchema.parse(raw);
  await ctx.tx.update(competition).set(input).where(eq(competition.id, competitionId));
  await ctx.audit({
    action: "competition.settings",
    entityType: "competition",
    entityId: competitionId,
    before,
    after: input,
  });
}

export const COMPETITION_STATUSES = ["DRAFT", "LIVE", "FINISHED", "ARCHIVED"] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

/** Abrir, cerrar o archivar. Reabrir una cerrada es de ADMIN. */
export async function setCompetitionStatus(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  status: CompetitionStatus,
): Promise<void> {
  const row = await lockedCompetition(ctx, competitionId);
  await assertOperator(actor, competitionId, ctx.tx);
  const closed = row.status === "FINISHED" || row.status === "ARCHIVED";
  if (closed && (status === "DRAFT" || status === "LIVE") && !actor.isAdmin) {
    throw new DomainError(t("T-2793"));
  }
  if (row.status === status) return;
  const archiving = status === "ARCHIVED";
  await ctx.tx
    .update(competition)
    .set(archiving ? { status, showCaptains: false } : { status })
    .where(eq(competition.id, competitionId));
  await ctx.audit({
    action: "competition.status",
    entityType: "competition",
    entityId: competitionId,
    before: { status: row.status },
    after: { status },
  });
  // Archivar borra los capitanes y apaga su vitrina (ADR-095 regla 5); la auditoría solo cuenta.
  if (archiving) {
    const removed = await purgeCaptains(ctx, competitionId);
    if (removed > 0 || row.showCaptains) {
      await ctx.audit({
        action: "competition.captains.clear",
        entityType: "competition",
        entityId: competitionId,
        before: { showCaptains: row.showCaptains },
        after: { captains: removed, showCaptains: false, reason: "ARCHIVED" },
      });
    }
  }
}

// --- Equipos -------------------------------------------------------------------------------------

export const teamInputSchema = z.object({
  number: z.coerce.number().int().min(1).max(99),
  name: z.string().trim().min(1).max(60),
  color: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/)
    .nullable()
    .default(null),
  submissionId: z.string().trim().min(1).nullable().default(null),
});
export type TeamInput = z.input<typeof teamInputSchema>;

function teamConflict(error: unknown, input: z.infer<typeof teamInputSchema>): never {
  if (isUniqueViolation(error, "competition_team_number_unique")) {
    throw new DomainError(t("T-2766", { n: input.number }), "number");
  }
  if (isUniqueViolation(error, "competition_team_name_unique")) {
    throw new DomainError(t("T-2767", { nombre: input.name }), "name");
  }
  if (isUniqueViolation(error, "competition_team_submission_unique")) {
    throw new DomainError(t("T-2768"), "submissionId");
  }
  throw error;
}

/** Un equipo nuevo, a mano o a partir de una respuesta del formulario de inscripción. */
export async function createTeam(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: TeamInput,
): Promise<{ id: string }> {
  const row = await openCompetition(ctx, actor, competitionId);
  const input = teamInputSchema.parse(raw);
  if (input.submissionId) {
    const submission = await getSubmission(input.submissionId);
    if (!submission || !row.registrationFormId || submission.formId !== row.registrationFormId) {
      throw new DomainError(t("T-2768"), "submissionId");
    }
  }
  try {
    const [team] = await ctx.tx
      .insert(competitionTeam)
      .values({ competitionId, ...input })
      .returning({ id: competitionTeam.id });
    if (!team) throw new Error("team insert");
    await ctx.audit({
      action: "competition.team.create",
      entityType: "competition_team",
      entityId: team.id,
      after: input,
    });
    return team;
  } catch (error) {
    teamConflict(error, input);
  }
}

export const teamUpdateSchema = teamInputSchema.omit({ submissionId: true });
export type TeamUpdateInput = z.input<typeof teamUpdateSchema>;

export async function updateTeam(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  teamId: string,
  raw: TeamUpdateInput,
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const before = await ownedTeam(ctx.tx, competitionId, teamId);
  const input = teamUpdateSchema.parse(raw);
  try {
    await ctx.tx.update(competitionTeam).set(input).where(eq(competitionTeam.id, teamId));
  } catch (error) {
    teamConflict(error, { ...input, submissionId: null });
  }
  await ctx.audit({
    action: "competition.team.update",
    entityType: "competition_team",
    entityId: teamId,
    before: { number: before.number, name: before.name, color: before.color },
    after: input,
  });
}

export async function setTeamStatus(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  teamId: string,
  status: "ACTIVE" | "WITHDRAWN",
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const before = await ownedTeam(ctx.tx, competitionId, teamId);
  if (before.status === status) return;
  await ctx.tx.update(competitionTeam).set({ status }).where(eq(competitionTeam.id, teamId));
  await ctx.audit({
    action: "competition.team.status",
    entityType: "competition_team",
    entityId: teamId,
    before: { status: before.status },
    after: { status },
  });
}

export interface IssuedCode {
  teamId: string;
  number: number;
  name: string;
  code: string;
}

/** Emite el código de los equipos activos (de todos, o solo de los que no tienen). El código en
 *  claro sale una sola vez de aquí; la base guarda solo el hash y la auditoría no lo lleva. */
export async function issueTeamCodes(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  onlyMissing: boolean,
): Promise<IssuedCode[]> {
  await openCompetition(ctx, actor, competitionId);
  const teams = await ctx.tx
    .select()
    .from(competitionTeam)
    .where(
      and(
        eq(competitionTeam.competitionId, competitionId),
        eq(competitionTeam.status, "ACTIVE"),
        ...(onlyMissing ? [isNull(competitionTeam.codeHash)] : []),
      ),
    )
    .orderBy(competitionTeam.number);
  const secret = getEnv().SESSION_SECRET;
  const now = new Date();
  const issued: IssuedCode[] = [];
  for (const team of teams) {
    const code = generateTeamCode();
    await ctx.tx
      .update(competitionTeam)
      .set({
        codeHash: hashTeamCode(secret, team.id, code),
        codeIssuedAt: now,
        codeFailures: 0,
        codeLockedUntil: null,
      })
      .where(eq(competitionTeam.id, team.id));
    issued.push({ teamId: team.id, number: team.number, name: team.name, code });
  }
  await ctx.audit({
    action: "competition.team.codes",
    entityType: "competition",
    entityId: competitionId,
    after: { teams: issued.map((item) => item.number) },
  });
  return issued;
}

// --- Bases ---------------------------------------------------------------------------------------

export const baseInputSchema = z.object({
  day,
  orderIndex: z.coerce.number().int().min(0).max(99),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["NORMAL", "MACRO"]).default("NORMAL"),
  location: z.string().trim().max(120).nullable().default(null),
});
export type BaseInput = z.input<typeof baseInputSchema>;

export async function saveBase(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  baseId: string | null,
  raw: BaseInput,
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const input = baseInputSchema.parse(raw);
  try {
    if (baseId) {
      const [before] = await ctx.tx
        .select()
        .from(competitionBase)
        .where(
          and(eq(competitionBase.id, baseId), eq(competitionBase.competitionId, competitionId)),
        )
        .limit(1);
      if (!before) throw new DomainError(t("T-2764"));
      if (before.day !== input.day) {
        const [used] = await ctx.tx
          .select({ id: competitionMatchup.id })
          .from(competitionMatchup)
          .where(eq(competitionMatchup.baseId, baseId))
          .limit(1);
        if (used) throw new DomainError(t("T-2791"), "day");
      }
      // En una inflable no se usan poderes (ADR-098 regla 2): una base con poderes registrados no pasa
      // a serlo, porque cambiaría el efecto de lo que ya se declaró.
      if (before.kind === "NORMAL" && input.kind === "MACRO") {
        const [withPower] = await ctx.tx
          .select({ id: competitionPowerUse.id })
          .from(competitionPowerUse)
          .where(
            and(eq(competitionPowerUse.baseId, baseId), eq(competitionPowerUse.status, "ACTIVE")),
          )
          .limit(1);
        if (withPower) throw new DomainError(t("T-3059"), "kind");
      }
      await ctx.tx.update(competitionBase).set(input).where(eq(competitionBase.id, baseId));
      await ctx.audit({
        action: "competition.base.update",
        entityType: "competition_base",
        entityId: baseId,
        before,
        after: input,
      });
      return { id: baseId };
    }
    const [row] = await ctx.tx
      .insert(competitionBase)
      .values({ competitionId, ...input })
      .returning({ id: competitionBase.id });
    if (!row) throw new Error("base insert");
    await ctx.audit({
      action: "competition.base.create",
      entityType: "competition_base",
      entityId: row.id,
      after: input,
    });
    return row;
  } catch (error) {
    if (
      isUniqueViolation(error, "competition_base_order_unique") ||
      isUniqueViolation(error, "competition_base_name_unique")
    ) {
      throw new DomainError(t("T-2769", { dia: input.day }), "name");
    }
    throw error;
  }
}

// --- Personal ------------------------------------------------------------------------------------

export const staffInputSchema = z.object({
  personId: idField,
  role: z.enum(["OPERATOR", "JUDGE"]),
  baseId: z.string().trim().min(1).nullable().default(null),
});
export type StaffInput = z.input<typeof staffInputSchema>;

/** Los operadores los asignan ADMIN o la Dirección; a los jueces, cualquier operador. */
export async function assignStaff(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: StaffInput,
): Promise<{ id: string }> {
  const row = await openCompetition(ctx, actor, competitionId);
  const input = staffInputSchema.parse(raw);
  if (input.role === "OPERATOR") {
    const director = await isMacroeventDirector(
      actor.personId,
      row.editionId,
      THE_GAMES_ROLE_CODE,
      ctx.tx,
    );
    if (!actor.isAdmin && !director) throw new DomainError(t("T-2765"));
  }
  const baseId = input.role === "JUDGE" ? input.baseId : null;
  if (input.role === "JUDGE") {
    const [base] = baseId
      ? await ctx.tx
          .select({ id: competitionBase.id })
          .from(competitionBase)
          .where(
            and(eq(competitionBase.id, baseId), eq(competitionBase.competitionId, competitionId)),
          )
          .limit(1)
      : [];
    if (!base) throw new DomainError(t("T-2764"), "baseId");
  }
  const membership = await getMembershipRef(input.personId, ctx.tx);
  if (!membership || !["ACTIVE", "HONORARY"].includes(membership.status)) {
    throw new DomainError(t("T-2796"), "personId");
  }
  try {
    const [staff] = await ctx.tx
      .insert(competitionStaff)
      .values({
        competitionId,
        personId: input.personId,
        role: input.role,
        baseId,
        createdById: actor.personId,
      })
      .returning({ id: competitionStaff.id });
    if (!staff) throw new Error("staff insert");
    await ctx.audit({
      action: "competition.staff.assign",
      entityType: "competition_staff",
      entityId: staff.id,
      after: { personId: input.personId, role: input.role, baseId },
    });
    return staff;
  } catch (error) {
    if (
      isUniqueViolation(error, "competition_staff_operator_unique") ||
      isUniqueViolation(error, "competition_staff_judge_unique")
    ) {
      throw new DomainError(t("T-2797"), "personId");
    }
    throw error;
  }
}

export async function removeStaff(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  staffId: string,
): Promise<void> {
  const row = await openCompetition(ctx, actor, competitionId);
  const [before] = await ctx.tx
    .select()
    .from(competitionStaff)
    .where(and(eq(competitionStaff.id, staffId), eq(competitionStaff.competitionId, competitionId)))
    .limit(1);
  if (!before) throw new DomainError(t("T-2764"));
  if (before.role === "OPERATOR" && !actor.isAdmin) {
    if (!(await isMacroeventDirector(actor.personId, row.editionId, THE_GAMES_ROLE_CODE, ctx.tx))) {
      throw new DomainError(t("T-2765"));
    }
  }
  await ctx.tx.delete(competitionStaff).where(eq(competitionStaff.id, staffId));
  await ctx.audit({
    action: "competition.staff.remove",
    entityType: "competition_staff",
    entityId: staffId,
    before,
  });
}

/** Quita a alguien del apoyo de una base (ADR-101). Lo hace cualquier operador: el apoyo no da
 *  acceso a nada. */
export async function removeSupport(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  supportId: string,
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const [before] = await ctx.tx
    .select()
    .from(competitionSupport)
    .where(
      and(
        eq(competitionSupport.id, supportId),
        eq(competitionSupport.competitionId, competitionId),
      ),
    )
    .limit(1);
  if (!before) throw new DomainError(t("T-2764"));
  await ctx.tx.delete(competitionSupport).where(eq(competitionSupport.id, supportId));
  await ctx.audit({
    action: "competition.support.remove",
    entityType: "competition_support",
    entityId: supportId,
    before,
  });
}

// --- Anuncios ------------------------------------------------------------------------------------

export const announcementInputSchema = z.object({
  message: z.string().trim().min(1).max(280),
  level: z.enum(["INFO", "WARNING", "URGENT"]).default("INFO"),
});
export type AnnouncementInput = z.input<typeof announcementInputSchema>;

export async function createAnnouncement(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: AnnouncementInput,
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const input = announcementInputSchema.parse(raw);
  const [row] = await ctx.tx
    .insert(competitionAnnouncement)
    .values({ competitionId, ...input, createdById: actor.personId })
    .returning({ id: competitionAnnouncement.id });
  if (!row) throw new Error("announcement insert");
  await ctx.audit({
    action: "competition.announcement.create",
    entityType: "competition_announcement",
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function setAnnouncementActive(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  announcementId: string,
  active: boolean,
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const updated = await ctx.tx
    .update(competitionAnnouncement)
    .set({ active })
    .where(
      and(
        eq(competitionAnnouncement.id, announcementId),
        eq(competitionAnnouncement.competitionId, competitionId),
      ),
    )
    .returning({ id: competitionAnnouncement.id });
  if (updated.length === 0) throw new DomainError(t("T-2764"));
  await ctx.audit({
    action: "competition.announcement.active",
    entityType: "competition_announcement",
    entityId: announcementId,
    after: { active },
  });
}

// --- Competencias extra y ajustes ----------------------------------------------------------------

export const EXTRA_KINDS = ["DIRECT", "THE_CHALLENGE_RUBRIC"] as const;

export const extraInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  day,
  /** Puntos directos, o la rúbrica de The Challenge: 5 criterios y total × 10 (ADR-089 regla 7). */
  kind: z.enum(EXTRA_KINDS).default("DIRECT"),
});
export type ExtraInput = z.input<typeof extraInputSchema>;

export async function createExtra(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ExtraInput,
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const input = extraInputSchema.parse(raw);
  const rubric = input.kind === "THE_CHALLENGE_RUBRIC" ? THE_CHALLENGE_RUBRIC : null;
  try {
    const [row] = await ctx.tx
      .insert(competitionExtra)
      .values({
        competitionId,
        name: input.name,
        day: input.day,
        rubricScale: rubric?.scale ?? null,
      })
      .returning({ id: competitionExtra.id });
    if (!row) throw new Error("extra insert");
    if (rubric) {
      await ctx.tx.insert(competitionExtraCriterion).values(
        rubric.criteria.map((criterion, orderIndex) => ({
          extraId: row.id,
          name: criterion.name,
          weight: criterion.weight,
          orderIndex,
        })),
      );
    }
    await ctx.audit({
      action: "competition.extra.create",
      entityType: "competition_extra",
      entityId: row.id,
      after: input,
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "competition_extra_name_unique")) {
      throw new DomainError(t("T-2767", { nombre: input.name }), "name");
    }
    throw error;
  }
}

async function lockedExtra(ctx: CommandContext, competitionId: string, extraId: string) {
  const [extra] = await ctx.tx
    .select()
    .from(competitionExtra)
    .where(and(eq(competitionExtra.id, extraId), eq(competitionExtra.competitionId, competitionId)))
    .for("update");
  if (!extra) throw new DomainError(t("T-2764"));
  return extra;
}

/** Deja el total del equipo en la extra en `target` insertando solo la diferencia. */
async function applyExtraTotal(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  extra: typeof competitionExtra.$inferSelect,
  teamId: string,
  target: number,
): Promise<number> {
  const [current] = await ctx.tx
    .select({ total: sql<number>`coalesce(sum(${competitionPointEntry.points}), 0)::int` })
    .from(competitionPointEntry)
    .where(
      and(eq(competitionPointEntry.extraId, extra.id), eq(competitionPointEntry.teamId, teamId)),
    );
  const delta = extraDelta(current?.total ?? 0, target);
  if (delta === 0) return 0;
  await ctx.tx.insert(competitionPointEntry).values({
    competitionId,
    teamId,
    day: extra.day,
    kind: "EXTRA",
    points: delta,
    reason: extra.name,
    extraId: extra.id,
    createdById: actor.personId,
  });
  return delta;
}

export const extraPointsSchema = z.object({
  extraId: idField,
  teamId: idField,
  total: z.coerce.number().int().min(-100_000).max(100_000),
});
export type ExtraPointsInput = z.input<typeof extraPointsSchema>;

/** Deja el total del equipo en una extra de puntos directos en `total`: inserta solo la diferencia,
 *  así que repetir la orden no suma dos veces (ADR-089 regla 7). */
export async function setExtraPoints(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ExtraPointsInput,
): Promise<{ delta: number }> {
  await openCompetition(ctx, actor, competitionId);
  const input = extraPointsSchema.parse(raw);
  const extra = await lockedExtra(ctx, competitionId, input.extraId);
  if (extra.rubricScale !== null) throw new DomainError(t("T-2899"));
  await ownedTeam(ctx.tx, competitionId, input.teamId);
  const delta = await applyExtraTotal(ctx, actor, competitionId, extra, input.teamId, input.total);
  if (delta !== 0) {
    await ctx.audit({
      action: "competition.extra.points",
      entityType: "competition_extra",
      entityId: extra.id,
      after: { teamId: input.teamId, total: input.total, delta },
    });
  }
  return { delta };
}

export const rubricScoresSchema = z.object({
  extraId: idField,
  teamId: idField,
  /** Una nota por criterio, en el orden de la rúbrica. */
  scores: z.array(z.coerce.number()).max(20),
});
export type RubricScoresInput = z.input<typeof rubricScoresSchema>;

/** Guarda las notas consolidadas de un equipo y deja sus puntos en el total por la escala. Hacen
 *  falta todas las notas; volver a guardar las mismas no suma dos veces (ADR-089 regla 7). */
export async function setRubricScores(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: RubricScoresInput,
): Promise<{ total: number; points: number; delta: number }> {
  await openCompetition(ctx, actor, competitionId);
  const input = rubricScoresSchema.parse(raw);
  const extra = await lockedExtra(ctx, competitionId, input.extraId);
  if (extra.rubricScale === null) throw new DomainError(t("T-2764"));
  await ownedTeam(ctx.tx, competitionId, input.teamId);
  const criteria = await ctx.tx
    .select()
    .from(competitionExtraCriterion)
    .where(eq(competitionExtraCriterion.extraId, extra.id))
    .orderBy(competitionExtraCriterion.orderIndex);
  const valid =
    input.scores.length === criteria.length &&
    input.scores.every(
      (score) => Number.isInteger(score) && score >= RUBRIC_MIN_SCORE && score <= RUBRIC_MAX_SCORE,
    );
  if (!valid) throw new DomainError(t("T-2898"), "scores");
  const total = rubricTotal(criteria, input.scores);
  if (total === null) throw new DomainError(t("T-2898"), "scores");
  for (const [index, criterion] of criteria.entries()) {
    const score = input.scores[index] as number;
    await ctx.tx
      .insert(competitionExtraScore)
      .values({
        criterionId: criterion.id,
        teamId: input.teamId,
        score,
        recordedById: actor.personId,
      })
      .onConflictDoUpdate({
        target: [competitionExtraScore.criterionId, competitionExtraScore.teamId],
        set: { score, recordedById: actor.personId },
      });
  }
  const points = rubricPoints(total, extra.rubricScale);
  const delta = await applyExtraTotal(ctx, actor, competitionId, extra, input.teamId, points);
  await ctx.audit({
    action: "competition.extra.rubric",
    entityType: "competition_extra",
    entityId: extra.id,
    after: { teamId: input.teamId, scores: input.scores, total, points, delta },
  });
  return { total, points, delta };
}

export const adjustmentInputSchema = z.object({
  teamId: idField,
  day,
  points: z.coerce
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(2).max(200),
});
export type AdjustmentInput = z.input<typeof adjustmentInputSchema>;

/** Un ajuste manual con motivo; nunca se edita una fila del libro (ADR-007). */
export async function addAdjustment(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: AdjustmentInput,
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const parsed = adjustmentInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-2789"), "reason");
  const input = parsed.data;
  await ownedTeam(ctx.tx, competitionId, input.teamId);
  const [row] = await ctx.tx
    .insert(competitionPointEntry)
    .values({
      competitionId,
      teamId: input.teamId,
      day: input.day,
      kind: "ADJUSTMENT",
      points: input.points,
      reason: input.reason,
      createdById: actor.personId,
    })
    .returning({ id: competitionPointEntry.id });
  if (!row) throw new Error("adjustment insert");
  await ctx.audit({
    action: "competition.adjustment",
    entityType: "competition_point_entry",
    entityId: row.id,
    after: input,
  });
  return row;
}
