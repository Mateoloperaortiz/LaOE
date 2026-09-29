import { and, asc, eq, isNull, ne, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  competitionMatchup,
  competitionPowerGrant,
  competitionPowerUse,
  competitionResult,
  competitionTeam,
} from "../schema";
import { assertCanRecordAt, type CompetitionActor } from "./access";
import { lockedMatchup, rescoreMatchup } from "./play";
import {
  checkGrantLimits,
  MAX_POWERS_TEXT,
  POWER_TYPES,
  type Power,
  type PowerSheetProblem,
  parsePowerSheet,
} from "./powers-pure";
import { openCompetition, writableCompetition } from "./setup";

// Los poderes de The Games (ADR-098). La operación carga el reparto y marca las entregas; el líder de
// base registra la tarjeta que recibe antes de empezar; revertir después de empezar es de la operación
// y vuelve a calcular el resultado. Todo pasa por el candado de la competencia, así que dos pedidos a
// la vez se atienden de a uno; los índices únicos lo respaldan.

const day = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(1), z.literal(2)]));
const idField = z.string().trim().min(1);
const reasonField = z.string().trim().min(2).max(200);

export function powerName(power: Power): string {
  return tList("T-3040")[POWER_TYPES.indexOf(power)] ?? power;
}

function dayName(value: number): string {
  return (tList("T-3048")[value - 1] ?? String(value)).toLowerCase();
}

function describeProblem(problem: PowerSheetProblem): string {
  switch (problem.kind) {
    case "COLUMNS":
      return t("T-3069", { linea: problem.line });
    case "EXTRA_COLUMNS":
      return t("T-3070", { linea: problem.line });
    case "TEAM":
      return t("T-3024", { linea: problem.line, equipo: problem.team });
    case "POWER":
      return t("T-3071", { linea: problem.line, poder: problem.power });
    case "DAY":
      return t("T-3072", { linea: problem.line, dia: problem.day });
    case "TEAM_TOTAL":
      return t("T-3073", { equipo: problem.team });
    case "TEAM_DAY":
      return t("T-3074", { equipo: problem.team, dia: dayName(problem.day) });
    case "EMPTY":
      return t("T-2916");
  }
}

/** Las tarjetas activas (no anuladas) de la competencia o de un equipo, para los límites. */
async function activeGrants(ctx: CommandContext, competitionId: string, teamId?: string) {
  return ctx.tx
    .select({ teamId: competitionPowerGrant.teamId, day: competitionPowerGrant.day })
    .from(competitionPowerGrant)
    .where(
      and(
        eq(competitionPowerGrant.competitionId, competitionId),
        ne(competitionPowerGrant.status, "VOIDED"),
        teamId ? eq(competitionPowerGrant.teamId, teamId) : undefined,
      ),
    );
}

// --- Reparto y entregas --------------------------------------------------------------------------

export const importPowersInputSchema = z.object({ text: z.string().max(MAX_POWERS_TEXT) });
export type ImportPowersInput = z.input<typeof importPowersInputSchema>;

export interface ImportPowersResult {
  saved: boolean;
  /** Bloquean: no se guardó nada. */
  errors: string[];
  grants: number;
  teams: number;
}

/** Suma el reparto pegado (Equipo, Poder, Jornada), sin entregar, o no guarda nada si algo no cuadra. */
export async function importPowerGrants(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ImportPowersInput,
): Promise<ImportPowersResult> {
  await openCompetition(ctx, actor, competitionId);
  const parsed = importPowersInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-3075"), "text");
  const teams = await ctx.tx
    .select({ id: competitionTeam.id, number: competitionTeam.number, name: competitionTeam.name })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const existing = await activeGrants(ctx, competitionId);
  const { grants, problems } = parsePowerSheet(parsed.data.text, teams, existing);
  if (!grants) return { saved: false, errors: problems.map(describeProblem), grants: 0, teams: 0 };
  await ctx.tx
    .insert(competitionPowerGrant)
    .values(grants.map((grant) => ({ competitionId, ...grant, createdById: actor.personId })));
  const summary = { grants: grants.length, teams: new Set(grants.map((g) => g.teamId)).size };
  await ctx.audit({
    action: "competition.power.import",
    entityType: "competition",
    entityId: competitionId,
    after: summary,
  });
  return { saved: true, errors: [], ...summary };
}

export const addPowerInputSchema = z.object({
  teamId: idField,
  power: z.enum(POWER_TYPES),
  day,
  delivered: z.coerce.boolean().default(false),
});
export type AddPowerInput = z.input<typeof addPowerInputSchema>;

/** Suma una tarjeta a un equipo, para corregir el reparto sin volver a pegarlo. */
export async function addPowerGrant(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: AddPowerInput,
  now = new Date(),
): Promise<{ id: string }> {
  await openCompetition(ctx, actor, competitionId);
  const input = addPowerInputSchema.parse(raw);
  const [team] = await ctx.tx
    .select({ number: competitionTeam.number, name: competitionTeam.name })
    .from(competitionTeam)
    .where(
      and(eq(competitionTeam.id, input.teamId), eq(competitionTeam.competitionId, competitionId)),
    )
    .limit(1);
  if (!team) throw new DomainError(t("T-2764"));
  const label = `${team.number} ${team.name}`;
  const [problem] = checkGrantLimits(await activeGrants(ctx, competitionId, input.teamId), [
    { teamId: input.teamId, day: input.day },
  ]);
  if (problem) {
    throw new DomainError(
      problem.kind === "TEAM_TOTAL"
        ? t("T-3073", { equipo: label })
        : t("T-3074", { equipo: label, dia: dayName(problem.day) }),
    );
  }
  const [row] = await ctx.tx
    .insert(competitionPowerGrant)
    .values({
      competitionId,
      teamId: input.teamId,
      power: input.power,
      day: input.day,
      createdById: actor.personId,
      ...(input.delivered
        ? { status: "DELIVERED" as const, deliveredAt: now, deliveredById: actor.personId }
        : {}),
    })
    .returning({ id: competitionPowerGrant.id });
  if (!row) throw new Error("power grant insert");
  await ctx.audit({
    action: "competition.power.add",
    entityType: "competition_power_grant",
    entityId: row.id,
    after: { teamId: input.teamId, power: input.power, day: input.day, delivered: input.delivered },
  });
  return row;
}

export const deliverPowersInputSchema = z.object({
  day,
  teamId: idField.optional(),
  grantId: idField.optional(),
});
export type DeliverPowersInput = z.input<typeof deliverPowersInputSchema>;

/** Marca entregadas las tarjetas de una jornada: de todos, de un equipo o una sola. Solo cambian las
 *  que estaban sin entregar, así que repetir la orden no cambia nada. */
export async function deliverPowerGrants(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: DeliverPowersInput,
  now = new Date(),
): Promise<{ delivered: number }> {
  await openCompetition(ctx, actor, competitionId);
  const input = deliverPowersInputSchema.parse(raw);
  const rows = await ctx.tx
    .update(competitionPowerGrant)
    .set({ status: "DELIVERED", deliveredAt: now, deliveredById: actor.personId })
    .where(
      and(
        eq(competitionPowerGrant.competitionId, competitionId),
        eq(competitionPowerGrant.status, "ASSIGNED"),
        eq(competitionPowerGrant.day, input.day),
        input.teamId ? eq(competitionPowerGrant.teamId, input.teamId) : undefined,
        input.grantId ? eq(competitionPowerGrant.id, input.grantId) : undefined,
      ),
    )
    .returning({ id: competitionPowerGrant.id });
  if (rows.length === 0) return { delivered: 0 };
  await ctx.audit({
    action: "competition.power.deliver",
    entityType: "competition",
    entityId: competitionId,
    after: {
      day: input.day,
      teamId: input.teamId ?? null,
      grantId: input.grantId ?? null,
      delivered: rows.length,
    },
  });
  return { delivered: rows.length };
}

export const voidPowerInputSchema = z.object({ grantId: idField, reason: reasonField });
export type VoidPowerInput = z.input<typeof voidPowerInputSchema>;

/** Anula una tarjeta mal asignada, con motivo. Una tarjeta usada no se anula: primero se revierte el
 *  uso. */
export async function voidPowerGrant(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: VoidPowerInput,
  now = new Date(),
): Promise<{ changed: boolean }> {
  await openCompetition(ctx, actor, competitionId);
  const parsed = voidPowerInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-3057"), "reason");
  const input = parsed.data;
  const [grant] = await ctx.tx
    .select()
    .from(competitionPowerGrant)
    .where(
      and(
        eq(competitionPowerGrant.id, input.grantId),
        eq(competitionPowerGrant.competitionId, competitionId),
      ),
    )
    .for("update");
  if (!grant) throw new DomainError(t("T-2764"));
  if (grant.status === "VOIDED") return { changed: false };
  const [use] = await ctx.tx
    .select({ id: competitionPowerUse.id })
    .from(competitionPowerUse)
    .where(and(eq(competitionPowerUse.grantId, grant.id), eq(competitionPowerUse.status, "ACTIVE")))
    .limit(1);
  if (use) throw new DomainError(t("T-3055"));
  await ctx.tx
    .update(competitionPowerGrant)
    .set({ status: "VOIDED", voidedAt: now, voidedById: actor.personId, voidReason: input.reason })
    .where(eq(competitionPowerGrant.id, grant.id));
  await ctx.audit({
    action: "competition.power.void",
    entityType: "competition_power_grant",
    entityId: grant.id,
    before: { status: grant.status },
    after: { status: "VOIDED", reason: input.reason },
  });
  return { changed: true };
}

// --- Declaración en la base ----------------------------------------------------------------------

export const declarePowerInputSchema = z.object({
  matchupId: idField,
  teamId: idField,
  power: z.enum(POWER_TYPES),
});
export type DeclarePowerInput = z.input<typeof declarePowerInputSchema>;

/** El líder registra la tarjeta que le entregó un equipo antes de empezar la base (ADR-098 reglas 2
 *  y 4). Toma la tarjeta entregada más antigua de ese poder para la jornada de la rotación. Repetir el
 *  mismo pedido no registra otra. */
export async function declarePower(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: DeclarePowerInput,
  now = new Date(),
): Promise<{ changed: boolean; useId: string }> {
  const input = declarePowerInputSchema.parse(raw);
  await writableCompetition(ctx, competitionId);
  const { matchup, rotation, baseKind } = await lockedMatchup(ctx, competitionId, input.matchupId);
  const { operator } = await assertCanRecordAt(actor, competitionId, matchup.baseId, ctx.tx);
  if (input.teamId !== matchup.teamAId && input.teamId !== matchup.teamBId) {
    throw new DomainError(t("T-2764"));
  }
  const [team] = await ctx.tx
    .select({ name: competitionTeam.name, status: competitionTeam.status })
    .from(competitionTeam)
    .where(eq(competitionTeam.id, input.teamId))
    .limit(1);
  if (!team) throw new DomainError(t("T-2764"));
  const [existing] = await ctx.tx
    .select({ id: competitionPowerUse.id, power: competitionPowerGrant.power })
    .from(competitionPowerUse)
    .innerJoin(competitionPowerGrant, eq(competitionPowerGrant.id, competitionPowerUse.grantId))
    .where(
      and(
        eq(competitionPowerUse.rotationId, rotation.id),
        eq(competitionPowerUse.teamId, input.teamId),
        eq(competitionPowerUse.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (existing) {
    // Un reintento del mismo pedido no registra otra tarjeta; otro poder en la misma base, no se puede.
    if (existing.power === input.power) return { changed: false, useId: existing.id };
    throw new DomainError(t("T-3052", { equipo: team.name, poder: powerName(existing.power) }));
  }
  if (team.status !== "ACTIVE") throw new DomainError(t("T-3054"));
  if (baseKind !== "NORMAL") throw new DomainError(t("T-3049"));
  if (rotation.status === "PENDING" || (!operator && rotation.status !== "ACTIVE")) {
    throw new DomainError(t("T-3051"));
  }
  const [withResult] = await ctx.tx
    .select({ id: competitionResult.id })
    .from(competitionResult)
    .where(and(eq(competitionResult.matchupId, matchup.id), isNull(competitionResult.supersededAt)))
    .limit(1);
  if (matchup.startedAt || withResult) throw new DomainError(t("T-3050"));
  const [grant] = await ctx.tx
    .select({ id: competitionPowerGrant.id })
    .from(competitionPowerGrant)
    .where(
      and(
        eq(competitionPowerGrant.competitionId, competitionId),
        eq(competitionPowerGrant.teamId, input.teamId),
        eq(competitionPowerGrant.day, rotation.day),
        eq(competitionPowerGrant.power, input.power),
        eq(competitionPowerGrant.status, "DELIVERED"),
        notExists(
          ctx.tx
            .select({ one: sql`1` })
            .from(competitionPowerUse)
            .where(
              and(
                eq(competitionPowerUse.grantId, competitionPowerGrant.id),
                eq(competitionPowerUse.status, "ACTIVE"),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(competitionPowerGrant.createdAt), asc(competitionPowerGrant.id))
    .limit(1)
    .for("update");
  if (!grant) throw new DomainError(t("T-3053", { equipo: team.name }));
  let useId: string;
  try {
    const [use] = await ctx.tx
      .insert(competitionPowerUse)
      .values({
        competitionId,
        grantId: grant.id,
        rotationId: rotation.id,
        teamId: input.teamId,
        baseId: matchup.baseId,
        receivedById: actor.personId,
        createdAt: now,
      })
      .returning({ id: competitionPowerUse.id });
    if (!use) throw new Error("power use insert");
    useId = use.id;
  } catch (error) {
    if (isUniqueViolation(error, "competition_power_use_team_unique")) {
      throw new DomainError(t("T-3052", { equipo: team.name, poder: powerName(input.power) }));
    }
    if (isUniqueViolation(error, "competition_power_use_grant_unique")) {
      throw new DomainError(t("T-3053", { equipo: team.name }));
    }
    throw error;
  }
  await ctx.audit({
    action: "competition.power.declare",
    entityType: "competition_matchup",
    entityId: matchup.id,
    after: { useId, teamId: input.teamId, power: input.power, grantId: grant.id },
  });
  return { changed: true, useId };
}

export const revertPowerInputSchema = z.object({
  useId: idField,
  reason: z.string().trim().max(200).default(""),
});
export type RevertPowerInput = z.input<typeof revertPowerInputSchema>;

/** Revierte un poder registrado. Antes de empezar la base lo quita el líder o la operación; después,
 *  solo la operación y con motivo, y si la base ya tiene resultado se vuelve a calcular con reversiones
 *  en el libro. La tarjeta vuelve a quedar disponible en su jornada. */
export async function revertPowerUse(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: RevertPowerInput,
  now = new Date(),
): Promise<{ changed: boolean; rescored: boolean }> {
  const input = revertPowerInputSchema.parse(raw);
  await writableCompetition(ctx, competitionId);
  const [use] = await ctx.tx
    .select()
    .from(competitionPowerUse)
    .where(
      and(
        eq(competitionPowerUse.id, input.useId),
        eq(competitionPowerUse.competitionId, competitionId),
      ),
    )
    .limit(1);
  if (!use) throw new DomainError(t("T-2764"));
  const { operator } = await assertCanRecordAt(actor, competitionId, use.baseId, ctx.tx);
  if (use.status === "REVERTED") return { changed: false, rescored: false };
  const [found] = await ctx.tx
    .select({ id: competitionMatchup.id })
    .from(competitionMatchup)
    .where(
      and(
        eq(competitionMatchup.rotationId, use.rotationId),
        or(eq(competitionMatchup.teamAId, use.teamId), eq(competitionMatchup.teamBId, use.teamId)),
      ),
    )
    .limit(1);
  if (!found) throw new DomainError(t("T-2764"));
  const { matchup } = await lockedMatchup(ctx, competitionId, found.id);
  const [current] = await ctx.tx
    .select({ id: competitionResult.id })
    .from(competitionResult)
    .where(and(eq(competitionResult.matchupId, matchup.id), isNull(competitionResult.supersededAt)))
    .limit(1);
  const started = matchup.startedAt !== null || current !== undefined;
  if (started && !operator) throw new DomainError(t("T-3056"));
  let reason = t("T-3063");
  if (started) {
    const parsed = reasonField.safeParse(input.reason);
    if (!parsed.success) throw new DomainError(t("T-3057"), "reason");
    reason = parsed.data;
  } else if (input.reason.length >= 2) {
    reason = input.reason;
  }
  await ctx.tx
    .update(competitionPowerUse)
    .set({
      status: "REVERTED",
      revertedAt: now,
      revertedById: actor.personId,
      revertReason: reason,
    })
    .where(and(eq(competitionPowerUse.id, use.id), eq(competitionPowerUse.status, "ACTIVE")));
  const rescored = current
    ? await rescoreMatchup(
        ctx,
        actor,
        competitionId,
        matchup.id,
        t("T-3062", { motivo: reason }),
        now,
      )
    : false;
  await ctx.audit({
    action: "competition.power.revert",
    entityType: "competition_power_use",
    entityId: use.id,
    after: { reason, started, rescored },
  });
  return { changed: true, rescored };
}
