import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { getPresenceMembershipHistory } from "@/modules/people";
import { requireConfigIn } from "@/modules/system";
import { getTerm, lockOpenTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import type { PresenceStreak } from "../presence-types";
import { checkIn, occasion, pointEntry, presenceBonus } from "../schema";
import { getGamificationLaunch } from "./gamification-launch";
import { creditPresenceBonus, reversePresenceBonus } from "./ledger";
import { presenceStreakFromFacts } from "./presence-streak-pure";

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
    now: term.pointsClosedAt && term.pointsClosedAt < now ? term.pointsClosedAt : now,
  });
}

/** Lectura sin efectos: reconstruye el semestre completo y sus pausas, sin pagar historia. */
export async function getPresenceStreak(personId: string, termId: string): Promise<PresenceStreak> {
  const launch = await getGamificationLaunch();
  const launchedAt = launch.launchedAt ? new Date(launch.launchedAt) : null;
  return getDb().transaction(
    (exec) => readPresenceStreak(exec, personId, termId, launchedAt, new Date()),
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
  const participants = await ctx.tx
    .selectDistinct({ personId: checkIn.personId })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(eq(occasion.termId, termId));
  const awarded = await ctx.tx
    .selectDistinct({ personId: presenceBonus.personId })
    .from(presenceBonus)
    .where(eq(presenceBonus.termId, termId));
  for (const personId of [
    ...new Set([...participants, ...awarded].map((row) => row.personId)),
  ].sort()) {
    await reconcilePresenceBonuses(ctx, personId, termId, now);
  }
}
