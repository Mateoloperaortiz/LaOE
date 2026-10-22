import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { getPresenceMembershipHistory, listMembershipPersonIds } from "@/modules/people";
import { requireConfigIn } from "@/modules/system";
import { getTerm, lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  PRESENCE_PAUSE_REASONS,
  type PresenceRecognitionSnapshot,
  type PresenceStreak,
} from "../presence-types";
import { checkIn, occasion, pointEntry, presenceBonus, termStanding } from "../schema";
import { lockParticipationBatch } from "./batch-lock";
import { getGamificationLaunch } from "./gamification-launch";
import { weekKeyFor } from "./gamification-pure";
import { creditPresenceBonus, reversePresenceBonus } from "./ledger";
import { presenceNoticeEffectiveAt } from "./presence-notice-policy";
import { presenceStreakFromFacts } from "./presence-streak-pure";

const presenceRecognition = z.object({
  recognitionAvailable: z.literal(true),
  launched: z.boolean(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  weekStatus: z.enum(["COMPLETED", "PENDING", "PAUSED", "MISSED"]),
  weekKey: z.string(),
  bonus: z.number().int().nonnegative(),
  nextBonus: z.number().int().nonnegative(),
  weekPauseReasons: z.array(z.enum(PRESENCE_PAUSE_REASONS)).default([]),
  weeks: z.array(
    z.object({
      weekKey: z.string(),
      status: z.enum(["COMPLETED", "PENDING", "PAUSED", "MISSED"]),
      streak: z.number().int().nonnegative(),
      bonus: z.number().int().nonnegative(),
      pauseReasons: z.array(z.enum(PRESENCE_PAUSE_REASONS)).default([]),
    }),
  ),
});
const presenceStandingStats = z.object({
  presenceRecognitions: z
    .array(z.object({ personId: z.string(), recognition: presenceRecognition }))
    .optional(),
});

/** No reconstruye una foto que nunca se guardó ni promete una activación futura de un cierre. */
function unavailableRecognition(closedAt: Date): PresenceStreak {
  return {
    recognitionAvailable: false,
    launched: false,
    currentStreak: 0,
    longestStreak: 0,
    weekStatus: "PAUSED",
    weekKey: weekKeyFor(closedAt),
    bonus: 0,
    nextBonus: 0,
    weeks: [],
  };
}

async function readPresenceStreak(
  exec: Executor,
  personId: string,
  termId: string,
  launchedAt: Date | null,
  now: Date,
): Promise<PresenceStreak> {
  const term = await getTerm(termId, exec);
  if (!term) throw new DomainError(t("T-032"));
  const member = await getPresenceMembershipHistory(personId, termId, exec);
  const occasions = await exec
    .select({
      startsAt: occasion.startsAt,
      openedAt: occasion.openedAt,
      status: occasion.status,
      committeeId: occasion.committeeId,
      newMembersOnly: occasion.newMembersOnly,
      checkInStatus: checkIn.status,
      attendanceExtent: checkIn.attendanceExtent,
    })
    .from(occasion)
    .leftJoin(checkIn, and(eq(checkIn.occasionId, occasion.id), eq(checkIn.personId, personId)))
    .where(eq(occasion.termId, termId))
    .orderBy(asc(occasion.startsAt));
  return presenceStreakFromFacts({
    term,
    member,
    occasions,
    launchedAt: term.gamePointsSeparated ? launchedAt : null,
    notice24hEffectiveAt: await presenceNoticeEffectiveAt(exec),
    now: term.pointsClosedAt && term.pointsClosedAt < now ? term.pointsClosedAt : now,
  });
}

/** Lectura sin efectos: reconstruye el semestre completo y sus pausas, sin pagar historia. */
export async function getPresenceStreak(personId: string, termId: string): Promise<PresenceStreak> {
  const launch = await getGamificationLaunch();
  const launchedAt = launch.launchedAt ? new Date(launch.launchedAt) : null;
  return getDb().transaction(
    async (exec) => {
      const term = await getTerm(termId, exec);
      if (!term) throw new DomainError(t("T-032"));
      if (term.pointsClosedAt) {
        const [standing] = await exec
          .select({ stats: termStanding.stats })
          .from(termStanding)
          .where(eq(termStanding.termId, termId));
        const frozen = presenceStandingStats.parse(standing?.stats ?? {});
        return (
          frozen.presenceRecognitions?.find((row) => row.personId === personId)?.recognition ??
          unavailableRecognition(term.pointsClosedAt)
        );
      }
      return readPresenceStreak(exec, personId, termId, launchedAt, new Date());
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Primera asistencia, aprobación tardía y anulaciones usan la misma liquidación. El candado por
 * persona serializa semanas y correcciones; si cambia el importe, se revierte el crédito anterior
 * y se registra otro, conservando cada versión y todos los movimientos del libro.
 */
export async function reconcilePresenceBonuses(
  ctx: CommandContext,
  personId: string,
  termId: string,
  now = new Date(),
): Promise<number> {
  const term = await lockOpenTermPoints(ctx.tx, termId);
  if (!term.gamePointsSeparated) return 0;
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`reward:${personId}`}, 0))`,
  );
  const launch = await requireConfigIn(ctx, "gamification.launch");
  if (!launch.at || new Date(launch.at) > now) return 0;
  const launchedAt = new Date(launch.at);
  const state = await readPresenceStreak(ctx.tx, personId, termId, launchedAt, now);
  const previous = await ctx.tx
    .select({
      bonus: presenceBonus,
      entry: pointEntry,
      reversed: sql<boolean>`exists(select 1 from point_entry r where r.reversal_of_id = point_entry.id)`,
    })
    .from(presenceBonus)
    .innerJoin(pointEntry, eq(pointEntry.presenceBonusId, presenceBonus.id))
    .where(and(eq(presenceBonus.personId, personId), eq(presenceBonus.termId, termId)))
    .orderBy(asc(presenceBonus.version));
  const keys = new Set([
    ...state.weeks.map((week) => week.weekKey),
    ...previous.map((row) => row.bonus.weekKey),
  ]);
  let delta = 0;
  for (const weekKey of [...keys].sort()) {
    const desired = state.weeks.find((week) => week.weekKey === weekKey);
    const history = previous.filter((row) => row.bonus.weekKey === weekKey);
    const live = history.filter((row) => !row.reversed);
    if (live.length > 1) throw new Error("Más de un bono presencial vivo para la misma semana");
    const current = live[0];
    const points = desired?.bonus ?? 0;
    if ((current?.entry.points ?? 0) === points) continue;
    const reason = t("T-3460", { semana: weekKey });
    if (current) {
      await reversePresenceBonus(ctx, current.entry, reason);
      delta -= current.entry.points;
    }
    if (points > 0 && desired) {
      const [award] = await ctx.tx
        .insert(presenceBonus)
        .values({
          personId,
          termId,
          weekKey,
          version: (history.at(-1)?.bonus.version ?? 0) + 1,
          streakWeeks: desired.streak,
          points,
        })
        .returning({ id: presenceBonus.id });
      if (!award) throw new Error("No se pudo registrar el bono presencial");
      await creditPresenceBonus(ctx, { personId, termId, bonusId: award.id, points, reason });
      delta += points;
    }
    await ctx.audit({
      action: "presence-streak.reconciled",
      entityType: "presence_bonus",
      entityId: current?.bonus.id ?? `${personId}:${termId}:${weekKey}`,
      before: { weekKey, points: current?.entry.points ?? 0 },
      after: { personId, termId, weekKey, points, streak: desired?.streak ?? 0 },
    });
  }
  return delta;
}

/** También corre dentro de la transacción exclusiva del cierre: ningún bono queda afuera del podio. */
export async function reconcileTermPresenceBonuses(
  ctx: CommandContext,
  termId: string,
  now = new Date(),
): Promise<void> {
  // Un barrido toca varias personas: excluye otros lotes antes de tomar su primer reward. El
  // cierre y la cancelación ya entran con este mismo candado exclusivo, nunca con un subconjunto.
  await lockParticipationBatch(ctx.tx);
  await lockOpenTermPoints(ctx.tx, termId, "exclusive");
  for (const personId of await presencePersonIds(ctx.tx, termId)) {
    await reconcilePresenceBonuses(ctx, personId, termId, now);
  }
}

async function presencePersonIds(exec: Executor, termId: string): Promise<string[]> {
  const participants = await exec
    .selectDistinct({ personId: checkIn.personId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(eq(occasion.termId, termId));
  const awarded = await exec
    .selectDistinct({ personId: presenceBonus.personId })
    .from(presenceBonus)
    .where(eq(presenceBonus.termId, termId));
  return [...new Set([...participants, ...awarded].map((row) => row.personId))].sort();
}

/** Foto de todas las membresías y hechos, sin filtrar por estado actual ni depender del top. */
export async function captureTermPresenceRecognitions(
  ctx: CommandContext,
  termId: string,
  now: Date,
): Promise<PresenceRecognitionSnapshot[]> {
  const personIds = new Set(await presencePersonIds(ctx.tx, termId));
  let cursor: string | null = null;
  for (;;) {
    const batch = await listMembershipPersonIds(cursor, 500, ctx.tx);
    for (const personId of batch) personIds.add(personId);
    if (batch.length < 500) break;
    cursor = batch.at(-1) ?? null;
  }
  const launch = await requireConfigIn(ctx, "gamification.launch");
  const launchedAt = launch.at ? new Date(launch.at) : null;
  const snapshots: PresenceRecognitionSnapshot[] = [];
  for (const personId of [...personIds].sort()) {
    snapshots.push({
      personId,
      // Este camino lee los hechos, no el snapshot que el propio cierre está construyendo.
      recognition: await readPresenceStreak(ctx.tx, personId, termId, launchedAt, now),
    });
  }
  return snapshots;
}
