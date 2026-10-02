import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  competitionBase,
  competitionMarket,
  competitionMatchup,
  competitionPointEntry,
  competitionPowerGrant,
  competitionPowerUse,
  competitionResult,
  competitionRotation,
  competitionTeam,
} from "../schema";
import { assertCanRecordAt, type CompetitionActor } from "./access";
import { POWER_TYPES, type PowerUseInput, resolvePowers } from "./powers-pure";
import {
  type Day,
  dayOneRounds,
  dayTwoRounds,
  type ScheduleIssue,
  type ScheduleReport,
  type ScheduleRotation,
  validateSchedule,
} from "./schedule-pure";
import { type Outcome, pointsFor } from "./scoring-pure";
import { openCompetition, writableCompetition } from "./setup";

// El juego en vivo de The Games (ADR-089 reglas 6, 8 y 9): el calendario de cada jornada, las
// rotaciones con su reloj y los resultados. Los puntos los calcula el servidor desde el desenlace y
// quedan en el libro; corregir un resultado lo reemplaza y revierte sus filas. Con poderes (ADR-098),
// cada base tiene su inicio y el resultado guarda también el oficial.

const day = z.coerce
  .number()
  .int()
  .pipe(z.union([z.literal(1), z.literal(2)]));

// --- Calendario ----------------------------------------------------------------------------------

export const generateDayInputSchema = z.object({
  day,
  rotations: z.coerce.number().int().min(1).max(99),
  plannedMinutes: z.coerce.number().int().min(1).max(240),
});
export type GenerateDayInput = z.input<typeof generateDayInputSchema>;

/** Las rotaciones de una jornada, en orden. */
export async function dayRotations(ctx: CommandContext, competitionId: string, dayNumber: Day) {
  return ctx.tx
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.day, dayNumber),
      ),
    )
    .orderBy(asc(competitionRotation.number));
}

/** Genera las rotaciones de una jornada con la construcción de ADR-089 regla 8. La siembra k es el
 *  k-ésimo equipo activo por número; hacen falta el doble de equipos que de bases. */
export async function generateDaySchedule(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: GenerateDayInput,
): Promise<{ rotations: number; matchups: number }> {
  await openCompetition(ctx, actor, competitionId);
  const parsed = generateDayInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-2777"), "plannedMinutes");
  const input = parsed.data;
  if ((await dayRotations(ctx, competitionId, input.day)).length > 0) {
    throw new DomainError(t("T-2771", { dia: input.day }));
  }
  const teams = await ctx.tx
    .select({ id: competitionTeam.id })
    .from(competitionTeam)
    .where(
      and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.status, "ACTIVE")),
    )
    .orderBy(asc(competitionTeam.number));
  const bases = await ctx.tx
    .select({ id: competitionBase.id })
    .from(competitionBase)
    .where(
      and(eq(competitionBase.competitionId, competitionId), eq(competitionBase.day, input.day)),
    )
    .orderBy(asc(competitionBase.orderIndex));
  const n = bases.length;
  if (n < 3 || n % 2 === 0 || teams.length !== 2 * n || input.rotations > n) {
    throw new DomainError(
      t("T-2770", {
        dia: input.day,
        equipos: 2 * Math.max(n, 1),
        bases: n,
        hayEquipos: teams.length,
        hayBases: n,
      }),
    );
  }
  // Cada jornada se construye sola: la 2 existe para menos tamaños que la 1 (con 9 bases, por
  // ejemplo, no hay construcción) y eso no debe impedir generar la 1.
  let seeds: ReturnType<typeof dayOneRounds>;
  try {
    if (input.day === 1) {
      seeds = dayOneRounds(n, input.rotations);
    } else {
      const dayOne = (await dayRotations(ctx, competitionId, 1)).length;
      seeds = dayTwoRounds(n, Math.min(Math.max(dayOne, 1), n), input.rotations);
    }
  } catch {
    throw new DomainError(t("T-2893", { bases: n, dia: input.day }));
  }
  let matchups = 0;
  for (const [index, round] of seeds.entries()) {
    const [rotation] = await ctx.tx
      .insert(competitionRotation)
      .values({
        competitionId,
        day: input.day,
        number: index + 1,
        plannedSeconds: input.plannedMinutes * 60,
      })
      .returning({ id: competitionRotation.id });
    if (!rotation) throw new Error("rotation insert");
    const rows = round.map((pairing) => {
      const base = bases[pairing.base];
      const teamA = teams[pairing.a - 1];
      const teamB = teams[pairing.b - 1];
      if (!base || !teamA || !teamB) throw new Error("seed out of range");
      return { rotationId: rotation.id, baseId: base.id, teamAId: teamA.id, teamBId: teamB.id };
    });
    await ctx.tx.insert(competitionMatchup).values(rows);
    matchups += rows.length;
  }
  await ctx.audit({
    action: "competition.schedule.generate",
    entityType: "competition",
    entityId: competitionId,
    after: { day: input.day, rotations: seeds.length, plannedMinutes: input.plannedMinutes },
  });
  return { rotations: seeds.length, matchups };
}

/** Borra el calendario de una jornada que todavía no tiene resultados ni rotación en curso. */
export async function deleteDaySchedule(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  rawDay: number,
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const dayNumber = day.parse(rawDay);
  const rotations = await dayRotations(ctx, competitionId, dayNumber);
  if (rotations.length === 0) return;
  const ids = rotations.map((rotation) => rotation.id);
  const [withResult] = await ctx.tx
    .select({ id: competitionResult.id })
    .from(competitionResult)
    .innerJoin(competitionMatchup, eq(competitionMatchup.id, competitionResult.matchupId))
    .where(inArray(competitionMatchup.rotationId, ids))
    .limit(1);
  if (withResult || rotations.some((rotation) => rotation.status !== "PENDING")) {
    throw new DomainError(t("T-2772", { dia: dayNumber }));
  }
  await ctx.tx.delete(competitionRotation).where(inArray(competitionRotation.id, ids));
  await ctx.audit({
    action: "competition.schedule.delete",
    entityType: "competition",
    entityId: competitionId,
    before: { day: dayNumber, rotations: rotations.length },
  });
}

/** El calendario completo como lo lee el validador. */
export async function scheduleOf(ctx: CommandContext, competitionId: string) {
  const rotations = await ctx.tx
    .select()
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, competitionId));
  const matchups = rotations.length
    ? await ctx.tx
        .select()
        .from(competitionMatchup)
        .where(
          inArray(
            competitionMatchup.rotationId,
            rotations.map((rotation) => rotation.id),
          ),
        )
    : [];
  const teams = await ctx.tx
    .select({
      id: competitionTeam.id,
      number: competitionTeam.number,
      status: competitionTeam.status,
    })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const bases = await ctx.tx
    .select({ id: competitionBase.id, day: competitionBase.day })
    .from(competitionBase)
    .where(eq(competitionBase.competitionId, competitionId));
  return {
    rotations,
    schedule: rotations.map(
      (rotation): ScheduleRotation => ({
        id: rotation.id,
        day: rotation.day as Day,
        number: rotation.number,
        matchups: matchups.filter((matchup) => matchup.rotationId === rotation.id),
      }),
    ),
    teams: teams.map((team) => ({
      id: team.id,
      number: team.number,
      active: team.status === "ACTIVE",
    })),
    bases: bases.map((base) => ({ id: base.id, day: base.day as Day })),
  };
}

export function issueKey(issue: ScheduleIssue): string {
  return JSON.stringify(issue);
}

export const rotationMatchupsSchema = z.object({
  matchups: z
    .array(
      z.object({
        baseId: z.string().trim().min(1),
        teamAId: z.string().trim().min(1),
        teamBId: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(99),
  confirmWarnings: z.coerce.boolean().default(false),
});
export type RotationMatchupsInput = z.input<typeof rotationMatchupsSchema>;

export interface RotationMatchupsResult {
  saved: boolean;
  report: ScheduleReport;
  /** Advertencias que el cambio agrega y que hay que confirmar. */
  newWarnings: ScheduleIssue[];
}

/** Reemplaza los enfrentamientos de una rotación sin resultados. Los errores del validador bloquean;
 *  las advertencias nuevas piden confirmar (ADR-089 regla 8). */
export async function saveRotationMatchups(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  rotationId: string,
  raw: RotationMatchupsInput,
): Promise<RotationMatchupsResult> {
  await openCompetition(ctx, actor, competitionId);
  const input = rotationMatchupsSchema.parse(raw);
  const current = await scheduleOf(ctx, competitionId);
  const rotation = current.rotations.find((item) => item.id === rotationId);
  if (!rotation) throw new DomainError(t("T-2764"));
  if (rotation.status === "CLOSED") throw new DomainError(t("T-2774"));
  const existing = current.schedule.find((item) => item.id === rotationId)?.matchups ?? [];
  if (existing.length > 0) {
    const [withResult] = await ctx.tx
      .select({ id: competitionResult.id })
      .from(competitionResult)
      .where(
        and(
          inArray(
            competitionResult.matchupId,
            existing.flatMap((matchup) => (matchup.id ? [matchup.id] : [])),
          ),
          isNull(competitionResult.supersededAt),
        ),
      )
      .limit(1);
    if (withResult) throw new DomainError(t("T-2791"));
    // Los poderes van por rotación y equipo: cambiar los cruces cambiaría la base de un poder ya
    // registrado (ADR-098 regla 3).
    const [withPower] = await ctx.tx
      .select({ id: competitionPowerUse.id })
      .from(competitionPowerUse)
      .where(
        and(
          eq(competitionPowerUse.rotationId, rotationId),
          eq(competitionPowerUse.status, "ACTIVE"),
        ),
      )
      .limit(1);
    const [started] = await ctx.tx
      .select({ id: competitionMatchup.id })
      .from(competitionMatchup)
      .where(
        and(eq(competitionMatchup.rotationId, rotationId), isNotNull(competitionMatchup.startedAt)),
      )
      .limit(1);
    if (withPower || started) throw new DomainError(t("T-3058"));
  }
  const before = validateSchedule(current.schedule, current.teams, current.bases);
  const proposed = current.schedule.map((item) =>
    item.id === rotationId ? { ...item, matchups: input.matchups } : item,
  );
  const report = validateSchedule(proposed, current.teams, current.bases);
  const known = new Set(before.warnings.map(issueKey));
  const newWarnings = report.warnings.filter((issue) => !known.has(issueKey(issue)));
  if (report.errors.length > 0 || (newWarnings.length > 0 && !input.confirmWarnings)) {
    return { saved: false, report, newWarnings };
  }
  const existingIds = existing.flatMap((matchup) => (matchup.id ? [matchup.id] : []));
  if (existingIds.length > 0) {
    await ctx.tx
      .update(competitionMarket)
      .set({ matchupId: null })
      .where(inArray(competitionMarket.matchupId, existingIds));
  }
  await ctx.tx.delete(competitionMatchup).where(eq(competitionMatchup.rotationId, rotationId));
  await ctx.tx
    .insert(competitionMatchup)
    .values(
      input.matchups.map((matchup) => ({ ...matchup, rotationId, source: "MANUAL" as const })),
    );
  await ctx.audit({
    action: "competition.rotation.matchups",
    entityType: "competition_rotation",
    entityId: rotationId,
    before: existing.map(({ baseId, teamAId, teamBId }) => ({ baseId, teamAId, teamBId })),
    after: input.matchups,
  });
  return { saved: true, report, newWarnings };
}

// --- Rotaciones ----------------------------------------------------------------------------------

async function ownedRotation(ctx: CommandContext, competitionId: string, rotationId: string) {
  const [row] = await ctx.tx
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.id, rotationId),
        eq(competitionRotation.competitionId, competitionId),
      ),
    )
    .for("update");
  if (!row) throw new DomainError(t("T-2764"));
  return row;
}

async function activeRotation(ctx: CommandContext, competitionId: string) {
  const [row] = await ctx.tx
    .select()
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.status, "ACTIVE"),
      ),
    )
    .for("update");
  return row ?? null;
}

/** Inicia una rotación pendiente (o reabre una cerrada) con su reloj en UTC (ADR-020). */
export async function startRotation(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  rotationId: string,
  now = new Date(),
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const rotation = await ownedRotation(ctx, competitionId, rotationId);
  if (rotation.status === "ACTIVE") return;
  const active = await activeRotation(ctx, competitionId);
  if (active) throw new DomainError(t("T-2773"));
  const startsAt = rotation.status === "CLOSED" && rotation.startsAt ? rotation.startsAt : now;
  const endsAt =
    rotation.status === "CLOSED" && rotation.endsAt && rotation.endsAt > now
      ? rotation.endsAt
      : new Date(now.getTime() + rotation.plannedSeconds * 1000);
  await ctx.tx
    .update(competitionRotation)
    .set({
      status: "ACTIVE",
      startsAt,
      endsAt,
      startedById: rotation.startedById ?? actor.personId,
      closedAt: null,
    })
    .where(eq(competitionRotation.id, rotationId));
  await ctx.audit({
    action:
      rotation.status === "CLOSED" ? "competition.rotation.reopen" : "competition.rotation.start",
    entityType: "competition_rotation",
    entityId: rotationId,
    after: { startsAt, endsAt },
  });
}

/** Corre el final del reloj de la rotación en curso; nunca antes de ahora. */
export async function adjustRotationTimer(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  rotationId: string,
  deltaSeconds: number,
  now = new Date(),
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const rotation = await ownedRotation(ctx, competitionId, rotationId);
  if (rotation.status !== "ACTIVE" || !rotation.endsAt || !rotation.startsAt) {
    throw new DomainError(t("T-2774"));
  }
  const delta = z.coerce.number().int().min(-14_400).max(14_400).parse(deltaSeconds);
  const floor = Math.max(now.getTime(), rotation.startsAt.getTime() + 1000);
  const endsAt = new Date(Math.max(rotation.endsAt.getTime() + delta * 1000, floor));
  await ctx.tx
    .update(competitionRotation)
    .set({ endsAt })
    .where(eq(competitionRotation.id, rotationId));
  await ctx.audit({
    action: "competition.rotation.timer",
    entityType: "competition_rotation",
    entityId: rotationId,
    before: { endsAt: rotation.endsAt },
    after: { endsAt },
  });
}

/** Cierra la rotación en curso. Los enfrentamientos sin resultado quedan pendientes, a la vista. */
export async function closeRotation(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  rotationId: string,
  now = new Date(),
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  const rotation = await ownedRotation(ctx, competitionId, rotationId);
  if (rotation.status !== "ACTIVE") throw new DomainError(t("T-2774"));
  await ctx.tx
    .update(competitionRotation)
    .set({ status: "CLOSED", closedAt: now })
    .where(eq(competitionRotation.id, rotationId));
  await ctx.audit({
    action: "competition.rotation.close",
    entityType: "competition_rotation",
    entityId: rotationId,
    after: { closedAt: now },
  });
}

/** Cierra la rotación en curso, si hay, e inicia la siguiente pendiente en orden de jornada y número. */
export async function advanceRotation(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  now = new Date(),
): Promise<{ rotationId: string | null }> {
  await openCompetition(ctx, actor, competitionId);
  const active = await activeRotation(ctx, competitionId);
  if (active) await closeRotation(ctx, actor, competitionId, active.id, now);
  const [next] = await ctx.tx
    .select({ id: competitionRotation.id })
    .from(competitionRotation)
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.status, "PENDING"),
      ),
    )
    .orderBy(asc(competitionRotation.day), asc(competitionRotation.number))
    .limit(1);
  if (!next) return { rotationId: null };
  await startRotation(ctx, actor, competitionId, next.id, now);
  return { rotationId: next.id };
}

// --- Resultados ----------------------------------------------------------------------------------

export const resultInputSchema = z.object({
  matchupId: z.string().trim().min(1),
  outcome: z.enum(["A_WIN", "B_WIN", "DRAW"]),
  notes: z.string().trim().max(500).default(""),
});
export type ResultInput = z.input<typeof resultInputSchema>;

/** El enfrentamiento con su rotación y el tipo de base, bloqueado para escribir. Uno de otra
 *  competencia se responde como inexistente (ADR-072). */
export async function lockedMatchup(ctx: CommandContext, competitionId: string, matchupId: string) {
  const [row] = await ctx.tx
    .select({
      matchup: competitionMatchup,
      rotation: competitionRotation,
      baseKind: competitionBase.kind,
    })
    .from(competitionMatchup)
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
    .innerJoin(competitionBase, eq(competitionBase.id, competitionMatchup.baseId))
    .where(
      and(
        eq(competitionMatchup.id, matchupId),
        eq(competitionRotation.competitionId, competitionId),
      ),
    )
    .for("update", { of: competitionMatchup });
  if (!row) throw new DomainError(t("T-2764"));
  return row;
}

type LockedMatchup = Awaited<ReturnType<typeof lockedMatchup>>;

/** Reemplaza el resultado vigente, si lo hay, y revierte sus filas del libro. */
async function supersede(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  matchupId: string,
  reason: string,
  now: Date,
) {
  const [current] = await ctx.tx
    .select()
    .from(competitionResult)
    .where(and(eq(competitionResult.matchupId, matchupId), isNull(competitionResult.supersededAt)))
    .for("update");
  if (!current) return null;
  await ctx.tx
    .update(competitionResult)
    .set({ supersededAt: now, supersedeReason: reason })
    .where(eq(competitionResult.id, current.id));
  const entries = await ctx.tx
    .select()
    .from(competitionPointEntry)
    .where(
      and(eq(competitionPointEntry.resultId, current.id), eq(competitionPointEntry.kind, "MATCH")),
    );
  for (const entry of entries) {
    await ctx.tx.insert(competitionPointEntry).values({
      competitionId,
      teamId: entry.teamId,
      day: entry.day,
      kind: "REVERSAL",
      points: -entry.points,
      reason,
      reversalOfId: entry.id,
      createdById: actor.personId,
    });
  }
  return current;
}

/** Los poderes activos de los dos equipos de un enfrentamiento (ADR-098), con su lado, en el orden en
 *  que se recibieron las tarjetas. */
async function matchupPowerUses(
  ctx: CommandContext,
  matchup: { rotationId: string; teamAId: string; teamBId: string },
): Promise<PowerUseInput[]> {
  const rows = await ctx.tx
    .select({
      id: competitionPowerUse.id,
      teamId: competitionPowerUse.teamId,
      power: competitionPowerGrant.power,
    })
    .from(competitionPowerUse)
    .innerJoin(competitionPowerGrant, eq(competitionPowerGrant.id, competitionPowerUse.grantId))
    .where(
      and(
        eq(competitionPowerUse.rotationId, matchup.rotationId),
        eq(competitionPowerUse.status, "ACTIVE"),
        inArray(competitionPowerUse.teamId, [matchup.teamAId, matchup.teamBId]),
      ),
    )
    .orderBy(asc(competitionPowerUse.createdAt), asc(competitionPowerUse.id));
  return rows.map((row) => ({
    id: row.id,
    side: row.teamId === matchup.teamAId ? ("A" as const) : ("B" as const),
    power: row.power,
  }));
}

/** Inserta el resultado y sus filas del libro con los puntos oficiales. Con poderes, el resolvedor de
 *  ADR-098 fija el resultado oficial y su desglose; sin poderes, son los de la cancha. */
async function writeResult(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  { matchup, rotation, baseKind }: LockedMatchup,
  outcome: Outcome,
  notes: string,
) {
  const uses = await matchupPowerUses(ctx, matchup);
  const resolution = uses.length > 0 ? resolvePowers({ baseKind, outcome, uses }) : null;
  const points = resolution?.points ?? pointsFor(baseKind, outcome);
  const [result] = await ctx.tx
    .insert(competitionResult)
    .values({
      matchupId: matchup.id,
      outcome,
      notes,
      recordedById: actor.personId,
      officialOutcome: resolution?.official ?? null,
      powerDetail: resolution?.detail ?? null,
    })
    .returning({ id: competitionResult.id });
  if (!result) throw new Error("result insert");
  const names = tList("T-3040");
  const reason = resolution
    ? t("T-3061", {
        poderes: uses.map((use) => names[POWER_TYPES.indexOf(use.power)] ?? use.power).join(", "),
      })
    : "";
  const entries = [
    { teamId: matchup.teamAId, points: points.a },
    { teamId: matchup.teamBId, points: points.b },
  ].filter((entry) => entry.points !== 0);
  if (entries.length > 0) {
    await ctx.tx.insert(competitionPointEntry).values(
      entries.map((entry) => ({
        competitionId,
        teamId: entry.teamId,
        day: rotation.day,
        kind: "MATCH" as const,
        points: entry.points,
        reason,
        resultId: result.id,
        createdById: actor.personId,
      })),
    );
  }
  return { resultId: result.id, points, resolution };
}

/** Registra el desenlace de la cancha. El mismo desenlace otra vez no cambia nada; uno distinto
 *  corrige, pero solo la operación: el juez registra una sola vez, en su base y en la rotación en curso
 *  (ADR-089 regla 10, ADR-106). Registrar también cierra la declaración de poderes (ADR-098 regla 4). */
export async function recordResult(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ResultInput,
  now = new Date(),
): Promise<{ changed: boolean; resultId: string }> {
  const input = resultInputSchema.parse(raw);
  await writableCompetition(ctx, competitionId);
  const locked = await lockedMatchup(ctx, competitionId, input.matchupId);
  const { matchup, rotation } = locked;
  const { operator } = await assertCanRecordAt(actor, competitionId, matchup.baseId, ctx.tx);
  if (!operator && rotation.status !== "ACTIVE") throw new DomainError(t("T-2775"));
  if (!matchup.startedAt) {
    await ctx.tx
      .update(competitionMatchup)
      .set({ startedAt: now, startedById: actor.personId })
      .where(eq(competitionMatchup.id, matchup.id));
  }
  const [current] = await ctx.tx
    .select()
    .from(competitionResult)
    .where(and(eq(competitionResult.matchupId, matchup.id), isNull(competitionResult.supersededAt)))
    .limit(1);
  // Registrado, el resultado queda bloqueado para el juez (ADR-106): repetirlo no hace nada (un doble
  // toque) y cambiarlo es de la operación. Tampoco toca las notas que haya puesto la operación.
  if (current && !operator) {
    if (current.outcome === input.outcome) return { changed: false, resultId: current.id };
    throw new DomainError(t("T-3200"));
  }
  if (current && current.outcome === input.outcome) {
    if (current.notes !== input.notes) {
      await ctx.tx
        .update(competitionResult)
        .set({ notes: input.notes })
        .where(eq(competitionResult.id, current.id));
    }
    return { changed: false, resultId: current.id };
  }
  const previous = await supersede(ctx, actor, competitionId, matchup.id, t("T-2794"), now);
  const written = await writeResult(ctx, actor, competitionId, locked, input.outcome, input.notes);
  await ctx.audit({
    action: previous ? "competition.result.correct" : "competition.result.record",
    entityType: "competition_matchup",
    entityId: matchup.id,
    before: previous
      ? { outcome: previous.outcome, official: previous.officialOutcome ?? previous.outcome }
      : undefined,
    after: {
      outcome: input.outcome,
      points: written.points,
      ...(written.resolution
        ? { official: written.resolution.official, powers: written.resolution.detail.uses }
        : {}),
    },
  });
  return { changed: true, resultId: written.resultId };
}

/** El líder confirma los poderes de su base (ADR-098 regla 4, ADR-106): la base ya empezó con la
 *  rotación, y desde aquí no se registran poderes. La cuenta de «El adversario empieza 1 min tarde» sale
 *  de esta hora. Confirmar dos veces conserva la primera. */
export async function startMatchup(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  matchupId: string,
  now = new Date(),
): Promise<{ changed: boolean }> {
  await writableCompetition(ctx, competitionId);
  const { matchup, rotation } = await lockedMatchup(ctx, competitionId, matchupId);
  await assertCanRecordAt(actor, competitionId, matchup.baseId, ctx.tx);
  if (matchup.startedAt) return { changed: false };
  if (rotation.status !== "ACTIVE") throw new DomainError(t("T-3060"));
  await ctx.tx
    .update(competitionMatchup)
    .set({ startedAt: now, startedById: actor.personId })
    .where(eq(competitionMatchup.id, matchup.id));
  await ctx.audit({
    action: "competition.matchup.start",
    entityType: "competition_matchup",
    entityId: matchup.id,
    after: { startedAt: now },
  });
  return { changed: true };
}

/** Vuelve a calcular el resultado vigente con los poderes de ahora (ADR-098): lo reemplaza por el mismo
 *  desenlace y revierte sus filas del libro. Sin resultado no hace nada. Quien lo llama ya comprobó el
 *  permiso. */
export async function rescoreMatchup(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  matchupId: string,
  reason: string,
  now = new Date(),
): Promise<boolean> {
  const locked = await lockedMatchup(ctx, competitionId, matchupId);
  const previous = await supersede(ctx, actor, competitionId, matchupId, reason, now);
  if (!previous) return false;
  const written = await writeResult(
    ctx,
    actor,
    competitionId,
    locked,
    previous.outcome,
    previous.notes,
  );
  await ctx.audit({
    action: "competition.result.rescore",
    entityType: "competition_matchup",
    entityId: matchupId,
    before: { official: previous.officialOutcome ?? previous.outcome },
    after: {
      official: written.resolution?.official ?? previous.outcome,
      points: written.points,
      reason,
    },
  });
  return true;
}

/** Anula el resultado vigente: el enfrentamiento vuelve a quedar pendiente. Solo un operador. */
export async function voidResult(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  matchupId: string,
  now = new Date(),
): Promise<void> {
  await openCompetition(ctx, actor, competitionId);
  await lockedMatchup(ctx, competitionId, matchupId);
  const previous = await supersede(ctx, actor, competitionId, matchupId, t("T-2795"), now);
  if (!previous) return;
  await ctx.audit({
    action: "competition.result.void",
    entityType: "competition_matchup",
    entityId: matchupId,
    before: { outcome: previous.outcome },
  });
}
