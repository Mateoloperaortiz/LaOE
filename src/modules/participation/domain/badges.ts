import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { badgeUnlocked } from "@/domain-events/participation";
import { getPeopleByIds } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import type { BadgeFamily, BoosterKind } from "../gamification-types";
import {
  achievement,
  badgeDefinition,
  boosterItem,
  challenge,
  challengeParticipation,
  checkIn,
  occasion,
  wordleGame,
} from "../schema";
import { grantBoosterForAchievement } from "./boosters";
import { isVoluntaryOccasion } from "./gamification-pure";

// Colección de insignias (ADR-067 reglas 9, 10 y 15): cada familia se sostiene sobre hechos
// concretos del historial — asistencias aprobadas, retos completados y Wordles ganados —, así la
// conciliación histórica y el desbloqueo en vivo cuentan exactamente la misma historia. El nivel N
// se desbloquea con el hecho número `threshold` y guarda su fecha y su término.
//
// `recomputeBadgesFor` es el único escritor de logros de las cuatro familias: corre dentro de un
// advisory lock por persona, es idempotente (no duplica ni vuelve a otorgar el booster) y revoca
// lo que dejó de sostenerse. Las ediciones especiales no se recalculan: las otorga el admin y los
// handlers de ocasión cerrada y reto completado.

export type AchievementRow = typeof achievement.$inferSelect;
export type BadgeRow = typeof badgeDefinition.$inferSelect;

export interface BadgeFact {
  at: Date;
  termId: string;
  sourceKind: "CHECKIN" | "CHALLENGE" | "WORDLE";
  sourceRef: string;
  label: string;
}

type FactFamily = Exclude<BadgeFamily, "SPECIAL">;

const FACT_FAMILIES: readonly FactFamily[] = [
  "EN_PARCHE",
  "EXPLORADOR",
  "RELAMPAGO",
  "PALABRA_A_PALABRA",
];

/**
 * Los hechos que sostienen cada familia, de todos los términos (las asistencias importadas de
 * GHPOINTS cuentan; las entradas LEGACY del ledger nunca fueron un hecho).
 */
export async function badgeFactsFor(
  personId: string,
  exec: Executor = getDb(),
): Promise<Record<FactFamily, BadgeFact[]>> {
  const voluntary = await exec
    .select({
      checkInId: checkIn.id,
      at: checkIn.at,
      termId: occasion.termId,
      committeeId: occasion.committeeId,
      kind: occasion.kind,
      category: occasion.category,
      label: occasion.title,
    })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(and(eq(checkIn.personId, personId), eq(checkIn.status, "APPROVED")))
    .orderBy(asc(checkIn.at));
  const enParche: BadgeFact[] = [];
  const explorador: BadgeFact[] = [];
  const committeesSeen = new Set<string>();
  for (const row of voluntary) {
    if (!isVoluntaryOccasion(row)) {
      continue;
    }
    const fact: BadgeFact = {
      at: row.at,
      termId: row.termId,
      sourceKind: "CHECKIN",
      sourceRef: row.checkInId,
      label: row.label,
    };
    enParche.push(fact);
    if (row.committeeId && !committeesSeen.has(row.committeeId)) {
      committeesSeen.add(row.committeeId);
      explorador.push(fact);
    }
  }

  const challengesDone = await exec
    .select({
      participationId: challengeParticipation.id,
      at: challengeParticipation.decidedAt,
      submittedAt: challengeParticipation.submittedAt,
      termId: challenge.termId,
      label: challenge.title,
    })
    .from(challengeParticipation)
    .innerJoin(challenge, eq(challenge.id, challengeParticipation.challengeId))
    .where(
      and(
        eq(challengeParticipation.personId, personId),
        eq(challengeParticipation.status, "COMPLETED"),
      ),
    )
    .orderBy(asc(challengeParticipation.decidedAt), asc(challengeParticipation.submittedAt));
  const relampago: BadgeFact[] = challengesDone.map((row) => ({
    at: row.at ?? row.submittedAt,
    termId: row.termId,
    sourceKind: "CHALLENGE",
    sourceRef: row.participationId,
    label: row.label,
  }));

  const wordles = await exec
    .select({
      gameId: wordleGame.id,
      at: wordleGame.completedAt,
      termId: wordleGame.termId,
      day: wordleGame.day,
    })
    .from(wordleGame)
    .where(
      and(
        eq(wordleGame.personId, personId),
        eq(wordleGame.status, "WON"),
        isNotNull(wordleGame.completedAt),
      ),
    )
    .orderBy(asc(wordleGame.completedAt));
  const palabraAPalabra: BadgeFact[] = wordles
    .filter((row): row is typeof row & { at: Date } => row.at !== null)
    .map((row) => ({
      at: row.at,
      termId: row.termId,
      sourceKind: "WORDLE",
      sourceRef: row.gameId,
      label: row.day,
    }));

  return {
    EN_PARCHE: enParche,
    EXPLORADOR: explorador,
    RELAMPAGO: relampago,
    PALABRA_A_PALABRA: palabraAPalabra,
  };
}

export interface BadgeDelta {
  unlocked: Array<{
    achievementId: string;
    badgeId: string;
    code: string;
    family: BadgeFamily;
    level: number;
    name: string;
    boosterKind: BoosterKind | null;
  }>;
  revoked: Array<{ achievementId: string; code: string; level: number; boosterUsed: boolean }>;
}

interface PlannedUnlock {
  definition: BadgeRow;
  fact: BadgeFact;
}

interface PlannedRevoke {
  achievement: AchievementRow;
  badge: BadgeRow;
}

/** Calcula qué logros faltan y cuáles sobran comparando hechos con logros vivos. */
function planDelta(
  definitions: BadgeRow[],
  live: Array<AchievementRow & { badge: BadgeRow }>,
  facts: Record<FactFamily, BadgeFact[]>,
): { unlocks: PlannedUnlock[]; revokes: PlannedRevoke[] } {
  const liveByBadge = new Map(live.map((row) => [row.badgeId, row]));
  const unlocks: PlannedUnlock[] = [];
  const revokes: PlannedRevoke[] = [];
  for (const definition of definitions) {
    const family = definition.family as FactFamily;
    const threshold = definition.threshold ?? 0;
    const count = facts[family]?.length ?? 0;
    const current = liveByBadge.get(definition.id);
    if (count >= threshold && !current) {
      const fact = facts[family]?.[threshold - 1];
      if (fact) {
        unlocks.push({ definition, fact });
      }
    } else if (count < threshold && current) {
      revokes.push({ achievement: current, badge: current.badge });
    }
  }
  return { unlocks, revokes };
}

async function liveAchievementsFor(
  personId: string,
  exec: Executor,
): Promise<Array<AchievementRow & { badge: BadgeRow }>> {
  const rows = await exec
    .select({ achievement, badge: badgeDefinition })
    .from(achievement)
    .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
    .where(and(eq(achievement.personId, personId), isNull(achievement.revokedAt)));
  return rows.map((row) => ({ ...row.achievement, badge: row.badge }));
}

/**
 * Recalcula las cuatro familias con hechos (ADR-067 regla 10): desbloquea lo que el historial
 * sostiene, otorga el booster del nivel y emite `badge.unlocked`, y revoca lo que dejó de
 * sostenerse retirando su booster si sigue disponible (si ya se usó queda registrado en el delta
 * y en la auditoría para que GH decida el ajuste). Con `historical` no hay booster ni evento: la
 * insignia queda marcada como reconocimiento de la historia (T-2487). Con `dryRun` solo informa.
 */
export async function recomputeBadgesFor(
  personId: string,
  options: { historical: boolean; dryRun?: boolean; actor?: Actor; now?: Date },
): Promise<BadgeDelta> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun === true;
  const allowUnlocks = options.historical || (await requireConfig("gamification.enabled"));
  return runCommand(options.actor ?? SYSTEM_ACTOR, async (ctx) => {
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`badges:${personId}`}, 0))`,
    );
    const definitions = await ctx.tx
      .select()
      .from(badgeDefinition)
      .where(
        and(inArray(badgeDefinition.family, [...FACT_FAMILIES]), eq(badgeDefinition.active, true)),
      )
      .orderBy(asc(badgeDefinition.level));
    const live = await liveAchievementsFor(personId, ctx.tx);
    const facts = await badgeFactsFor(personId, ctx.tx);
    const planned = planDelta(definitions, live, facts);
    const unlocks = allowUnlocks ? planned.unlocks : [];
    const revokes = planned.revokes;

    const delta: BadgeDelta = { unlocked: [], revoked: [] };
    if (dryRun) {
      return {
        unlocked: unlocks.map(({ definition }) => ({
          achievementId: "",
          badgeId: definition.id,
          code: definition.code,
          family: definition.family,
          level: definition.level,
          name: definition.name,
          boosterKind: options.historical ? null : definition.level >= 3 ? "PLUS_100" : "PLUS_50",
        })),
        revoked: revokes.map(({ achievement: row, badge }) => ({
          achievementId: row.id,
          code: badge.code,
          level: badge.level,
          boosterUsed: false,
        })),
      };
    }

    const currentTerm = options.historical ? null : await findTermContaining(todayKey(now), ctx.tx);

    for (const { definition, fact } of unlocks) {
      const [inserted] = await ctx.tx
        .insert(achievement)
        .values({
          personId,
          badgeId: definition.id,
          unlockedAt: fact.at,
          termId: fact.termId,
          sourceKind: fact.sourceKind,
          sourceRef: fact.sourceRef,
          historical: options.historical,
        })
        .onConflictDoNothing({
          target: [achievement.personId, achievement.badgeId],
          where: sql`${achievement.revokedAt} is null`,
        })
        .returning();
      if (!inserted) {
        continue;
      }
      let boosterKind: BoosterKind | null = null;
      if (!options.historical) {
        const booster = await grantBoosterForAchievement(ctx, {
          personId,
          termId: currentTerm?.id ?? fact.termId,
          achievementId: inserted.id,
          level: definition.level,
        });
        boosterKind = booster?.kind ?? null;
        await ctx.emit(
          eventOf(badgeUnlocked, {
            achievementId: inserted.id,
            personId,
            badgeId: definition.id,
            code: definition.code,
            family: definition.family,
            level: definition.level,
            name: definition.name,
            termId: inserted.termId,
            historical: false,
            boosterKind,
          }),
        );
      }
      await ctx.audit({
        action: "achievement.unlocked",
        entityType: "achievement",
        entityId: inserted.id,
        before: null,
        after: {
          badgeId: definition.id,
          code: definition.code,
          level: definition.level,
          unlockedAt: fact.at.toISOString(),
          termId: fact.termId,
          historical: options.historical,
          boosterKind,
        },
      });
      delta.unlocked.push({
        achievementId: inserted.id,
        badgeId: definition.id,
        code: definition.code,
        family: definition.family,
        level: definition.level,
        name: definition.name,
        boosterKind,
      });
    }

    for (const { achievement: row, badge } of revokes) {
      const [booster] = await ctx.tx
        .select()
        .from(boosterItem)
        .where(eq(boosterItem.sourceAchievementId, row.id))
        .limit(1)
        .for("update");
      const boosterUsed = booster?.status === "CONSUMED";
      await ctx.tx
        .update(achievement)
        .set({ revokedAt: now, revokeReason: "SOURCE_REMOVED", featuredPosition: null })
        .where(eq(achievement.id, row.id));
      if (booster?.status === "AVAILABLE") {
        await ctx.tx
          .update(boosterItem)
          .set({ status: "REVOKED", revokedAt: now, revokeReason: "ACHIEVEMENT_REVOKED" })
          .where(eq(boosterItem.id, booster.id));
      }
      await ctx.audit({
        action: "achievement.revoked",
        entityType: "achievement",
        entityId: row.id,
        before: { badgeId: badge.id, code: badge.code, level: badge.level },
        after: { revokedAt: now.toISOString(), reason: "SOURCE_REMOVED", boosterUsed },
      });
      delta.revoked.push({
        achievementId: row.id,
        code: badge.code,
        level: badge.level,
        boosterUsed,
      });
    }

    return delta;
  });
}

const specialInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(""),
  specialChallengeId: z.string().trim().min(1).nullable().default(null),
  specialOccasionId: z.string().trim().min(1).nullable().default(null),
});
export type SpecialBadgeInput = z.infer<typeof specialInput>;

/**
 * Una edición especial (ADR-067 regla 15): se vincula a una ocasión o a un reto, no se recalcula
 * y se otorga a los asistentes aprobados o a quienes lo completen. Si el objetivo ya produjo sus
 * hechos (ocasión cerrada o reto con completados), otorga de inmediato.
 */
export async function createSpecialBadge(
  ctx: CommandContext,
  input: SpecialBadgeInput,
  context: { termId: string },
): Promise<{ id: string }> {
  const parsed = specialInput.parse(input);
  if ((parsed.specialChallengeId === null) === (parsed.specialOccasionId === null)) {
    throw new DomainError(t("T-032"));
  }
  const [row] = await ctx.tx
    .insert(badgeDefinition)
    .values({
      code: `SPECIAL_${createId().toUpperCase()}`,
      family: "SPECIAL",
      level: 1,
      name: parsed.name,
      description: parsed.description,
      specialChallengeId: parsed.specialChallengeId,
      specialOccasionId: parsed.specialOccasionId,
      termId: context.termId,
      createdById: ctx.actor.personId,
    })
    .returning();
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await ctx.audit({
    action: "badge.created",
    entityType: "badge_definition",
    entityId: row.id,
    before: null,
    after: {
      code: row.code,
      name: row.name,
      specialChallengeId: row.specialChallengeId,
      specialOccasionId: row.specialOccasionId,
      termId: row.termId,
    },
  });

  if (parsed.specialOccasionId) {
    const [linked] = await ctx.tx
      .select()
      .from(occasion)
      .where(eq(occasion.id, parsed.specialOccasionId))
      .limit(1);
    if (linked?.status === "CLOSED") {
      const attendees = await ctx.tx
        .select({ personId: checkIn.personId })
        .from(checkIn)
        .where(and(eq(checkIn.occasionId, linked.id), eq(checkIn.status, "APPROVED")));
      await awardSpecialBadge(
        ctx,
        row.id,
        attendees.map((item) => item.personId),
        { sourceKind: "OCCASION", sourceRef: linked.id, at: linked.startsAt },
      );
    }
  } else if (parsed.specialChallengeId) {
    const completed = await ctx.tx
      .select({ personId: challengeParticipation.personId })
      .from(challengeParticipation)
      .where(
        and(
          eq(challengeParticipation.challengeId, parsed.specialChallengeId),
          eq(challengeParticipation.status, "COMPLETED"),
        ),
      );
    if (completed.length > 0) {
      await awardSpecialBadge(
        ctx,
        row.id,
        completed.map((item) => item.personId),
        { sourceKind: "CHALLENGE", sourceRef: parsed.specialChallengeId, at: new Date() },
      );
    }
  }
  return { id: row.id };
}

/**
 * Otorga una edición especial a cada persona (idempotente por el único parcial): el logro nace
 * visto nulo para el diálogo, trae su booster PLUS_50 y emite `badge.unlocked` por cada nuevo.
 * Devuelve cuántos logros nuevos escribió.
 */
export async function awardSpecialBadge(
  ctx: CommandContext,
  badgeId: string,
  personIds: string[],
  source: { sourceKind: "OCCASION" | "CHALLENGE"; sourceRef: string; at: Date },
): Promise<number> {
  if (!(await requireConfig("gamification.enabled"))) {
    return 0;
  }
  const [badge] = await ctx.tx
    .select()
    .from(badgeDefinition)
    .where(eq(badgeDefinition.id, badgeId))
    .limit(1);
  if (!badge || !badge.active) {
    return 0;
  }
  let termId: string | null = badge.termId;
  if (!termId) {
    if (source.sourceKind === "OCCASION") {
      const [linked] = await ctx.tx
        .select({ termId: occasion.termId })
        .from(occasion)
        .where(eq(occasion.id, source.sourceRef))
        .limit(1);
      termId = linked?.termId ?? null;
    } else {
      const [linked] = await ctx.tx
        .select({ termId: challenge.termId })
        .from(challenge)
        .where(eq(challenge.id, source.sourceRef))
        .limit(1);
      termId = linked?.termId ?? null;
    }
  }
  let awarded = 0;
  for (const personId of personIds) {
    const [inserted] = await ctx.tx
      .insert(achievement)
      .values({
        personId,
        badgeId: badge.id,
        unlockedAt: source.at,
        termId,
        sourceKind: source.sourceKind,
        sourceRef: source.sourceRef,
        historical: false,
      })
      .onConflictDoNothing({
        target: [achievement.personId, achievement.badgeId],
        where: sql`${achievement.revokedAt} is null`,
      })
      .returning();
    if (!inserted) {
      continue;
    }
    awarded += 1;
    const booster = termId
      ? await grantBoosterForAchievement(ctx, {
          personId,
          termId,
          achievementId: inserted.id,
          level: badge.level,
        })
      : null;
    await ctx.emit(
      eventOf(badgeUnlocked, {
        achievementId: inserted.id,
        personId,
        badgeId: badge.id,
        code: badge.code,
        family: badge.family,
        level: badge.level,
        name: badge.name,
        termId,
        historical: false,
        boosterKind: booster?.kind ?? null,
      }),
    );
    await ctx.audit({
      action: "achievement.unlocked",
      entityType: "achievement",
      entityId: inserted.id,
      before: null,
      after: {
        badgeId: badge.id,
        code: badge.code,
        level: badge.level,
        sourceKind: source.sourceKind,
        sourceRef: source.sourceRef,
        boosterKind: booster?.kind ?? null,
      },
    });
  }
  return awarded;
}

/** Ediciones especiales de una ocasión que acaba de cerrar: una por asistente aprobado. */
export async function awardSpecialBadgesForOccasion(occasionId: string): Promise<number> {
  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    const specials = await ctx.tx
      .select()
      .from(badgeDefinition)
      .where(
        and(
          eq(badgeDefinition.family, "SPECIAL"),
          eq(badgeDefinition.specialOccasionId, occasionId),
          eq(badgeDefinition.active, true),
        ),
      );
    if (specials.length === 0) {
      return 0;
    }
    const [linked] = await ctx.tx
      .select()
      .from(occasion)
      .where(eq(occasion.id, occasionId))
      .limit(1);
    if (!linked) {
      return 0;
    }
    const attendees = await ctx.tx
      .select({ personId: checkIn.personId })
      .from(checkIn)
      .where(and(eq(checkIn.occasionId, occasionId), eq(checkIn.status, "APPROVED")));
    let awarded = 0;
    for (const badge of specials) {
      awarded += await awardSpecialBadge(
        ctx,
        badge.id,
        attendees.map((item) => item.personId),
        { sourceKind: "OCCASION", sourceRef: occasionId, at: linked.startsAt },
      );
    }
    return awarded;
  });
}

/** Ediciones especiales de un reto que la persona acaba de completar. */
export async function awardSpecialBadgesForChallenge(
  challengeId: string,
  personId: string,
): Promise<number> {
  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    const specials = await ctx.tx
      .select()
      .from(badgeDefinition)
      .where(
        and(
          eq(badgeDefinition.family, "SPECIAL"),
          eq(badgeDefinition.specialChallengeId, challengeId),
          eq(badgeDefinition.active, true),
        ),
      );
    let awarded = 0;
    for (const badge of specials) {
      awarded += await awardSpecialBadge(ctx, badge.id, [personId], {
        sourceKind: "CHALLENGE",
        sourceRef: challengeId,
        at: new Date(),
      });
    }
    return awarded;
  });
}

const FEATURED_LIMIT = 3;

/**
 * Destacar un logro propio en el directorio (ADR-067 regla 9): ocupa la menor posición libre de
 * 1 a 3; con las tres ocupadas el dominio responde T-2493 y la UI lo muestra.
 */
export async function setFeatured(
  ctx: CommandContext,
  input: { personId: string; achievementId: string; featured: boolean },
): Promise<void> {
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`badges:${input.personId}`}, 0))`,
  );
  const [row] = await ctx.tx
    .select()
    .from(achievement)
    .where(eq(achievement.id, input.achievementId))
    .for("update")
    .limit(1);
  if (!row || row.personId !== input.personId || row.revokedAt !== null) {
    throw new DomainError(t("T-032"));
  }
  if (input.featured === (row.featuredPosition !== null)) return;
  const before = row.featuredPosition;
  let position: number | null = null;
  if (input.featured) {
    const taken = await ctx.tx
      .select({ featuredPosition: achievement.featuredPosition })
      .from(achievement)
      .where(
        and(
          eq(achievement.personId, input.personId),
          isNull(achievement.revokedAt),
          isNotNull(achievement.featuredPosition),
        ),
      )
      .for("update");
    const used = new Set(taken.map((item) => item.featuredPosition));
    for (let candidate = 1; candidate <= FEATURED_LIMIT; candidate += 1) {
      if (!used.has(candidate)) {
        position = candidate;
        break;
      }
    }
    if (position === null) {
      throw new DomainError(t("T-2493"));
    }
  }
  await ctx.tx
    .update(achievement)
    .set({ featuredPosition: position })
    .where(eq(achievement.id, row.id));
  await ctx.audit({
    action: "achievement.featured",
    entityType: "achievement",
    entityId: row.id,
    before: { featuredPosition: before },
    after: { featuredPosition: position },
  });
}

/** Al anonimizar se sueltan las destacadas (ADR-030); los logros quedan como historia anónima. */
export async function clearFeaturedBadges(personId: string): Promise<number> {
  const rows = await getDb()
    .update(achievement)
    .set({ featuredPosition: null })
    .where(and(eq(achievement.personId, personId), isNotNull(achievement.featuredPosition)))
    .returning({ id: achievement.id });
  return rows.length;
}

/** Marca como vistas las insignias del diálogo de desbloqueo (una sola exhibición por logro). */
export async function markSeen(
  ctx: CommandContext,
  personId: string,
  achievementIds: string[],
): Promise<void> {
  if (achievementIds.length === 0) {
    return;
  }
  await ctx.tx
    .update(achievement)
    .set({ seenAt: new Date() })
    .where(
      and(
        eq(achievement.personId, personId),
        inArray(achievement.id, achievementIds),
        isNull(achievement.seenAt),
      ),
    );
}

export interface CollectionLevel {
  badge: BadgeRow;
  /** El logro más reciente del nivel: vivo o revocado (la UI distingue por `revokedAt`). */
  achievement: AchievementRow | null;
  /** Título del hecho que sostiene el nivel (ocasión, reto o día del Wordle); "" si no hay. */
  origin: string;
}

export interface CollectionFamily {
  family: FactFamily;
  levels: CollectionLevel[];
  progress: { current: number; next: number | null; level: number };
}

export interface BadgeCollection {
  families: CollectionFamily[];
  specials: Array<{ badge: BadgeRow; achievement: AchievementRow; origin: string }>;
  featured: Array<{ achievement: AchievementRow; badge: BadgeRow }>;
  unseen: Array<{
    achievement: AchievementRow;
    badge: BadgeRow;
    boosterKind: BoosterKind | null;
  }>;
  /** Términos con logros de la persona, para el filtro por semestre. */
  terms: string[];
}

/**
 * La colección del miembro (ADR-067 regla 9): cada familia con sus tres niveles, el progreso sobre
 * el historial completo (el filtro por semestre solo limita los logros mostrados, no la cuenta),
 * las ediciones especiales con su origen, las destacadas y las no vistas para el diálogo.
 */
export async function collectionFor(
  personId: string,
  options: { termId?: string | null } = {},
  now = new Date(),
): Promise<BadgeCollection> {
  void now;
  const db = getDb();
  const [definitions, allAchievements, facts] = await Promise.all([
    db
      .select()
      .from(badgeDefinition)
      .where(eq(badgeDefinition.active, true))
      .orderBy(asc(badgeDefinition.family), asc(badgeDefinition.level)),
    db
      .select()
      .from(achievement)
      .where(eq(achievement.personId, personId))
      .orderBy(asc(achievement.unlockedAt)),
    badgeFactsFor(personId, db),
  ]);

  const byBadge = new Map<string, AchievementRow>();
  for (const row of allAchievements) {
    const previous = byBadge.get(row.badgeId);
    if (!previous || (previous.revokedAt !== null && row.revokedAt === null)) {
      byBadge.set(row.badgeId, row);
    }
  }
  const inTerm = (row: AchievementRow | null | undefined): row is AchievementRow =>
    !!row && (!options.termId || row.termId === options.termId);
  const factByRef = new Map<string, BadgeFact>();
  for (const family of FACT_FAMILIES) {
    for (const fact of facts[family]) {
      factByRef.set(fact.sourceRef, fact);
    }
  }

  const families: CollectionFamily[] = FACT_FAMILIES.map((family) => {
    const defs = definitions
      .filter((row) => row.family === family)
      .sort((a, b) => a.level - b.level);
    const count = facts[family].length;
    const unlocked = defs.filter((row) => count >= (row.threshold ?? 0)).length;
    const nextDef = defs[unlocked];
    return {
      family,
      levels: defs.map((badge) => {
        const row = byBadge.get(badge.id);
        return {
          badge,
          achievement: inTerm(row) ? row : null,
          origin: (row?.sourceRef && factByRef.get(row.sourceRef)?.label) ?? "",
        };
      }),
      progress: {
        current: count,
        next: nextDef?.threshold ?? null,
        level: unlocked,
      },
    };
  });

  const heldSpecials = definitions
    .filter((row) => row.family === "SPECIAL")
    .flatMap((badge) => {
      const row = byBadge.get(badge.id);
      return row && row.revokedAt === null && inTerm(row) ? [{ badge, achievement: row }] : [];
    });
  // Los títulos se piden en un viaje por tabla, no en uno por insignia. La ocasión manda sobre el
  // reto: una especial que nombrara los dos saldría con el título de la ocasión.
  const occasionIds = heldSpecials.flatMap(({ badge }) => badge.specialOccasionId ?? []);
  const challengeIds = heldSpecials.flatMap(({ badge }) =>
    badge.specialOccasionId ? [] : (badge.specialChallengeId ?? []),
  );
  const [occasionRows, challengeRows] = await Promise.all([
    occasionIds.length
      ? db
          .select({ id: occasion.id, title: occasion.title })
          .from(occasion)
          .where(inArray(occasion.id, occasionIds))
      : [],
    challengeIds.length
      ? db
          .select({ id: challenge.id, title: challenge.title })
          .from(challenge)
          .where(inArray(challenge.id, challengeIds))
      : [],
  ]);
  const occasionTitles = new Map(occasionRows.map((row) => [row.id, row.title]));
  const challengeTitles = new Map(challengeRows.map((row) => [row.id, row.title]));
  const specials: BadgeCollection["specials"] = heldSpecials.map(({ badge, achievement: row }) => ({
    badge,
    achievement: row,
    origin:
      (badge.specialOccasionId
        ? occasionTitles.get(badge.specialOccasionId)
        : badge.specialChallengeId
          ? challengeTitles.get(badge.specialChallengeId)
          : undefined) ?? "",
  }));

  const liveRows = allAchievements.filter((row) => row.revokedAt === null);
  const badgeById = new Map(definitions.map((row) => [row.id, row]));
  const boosterByAchievement = await boosterKindsOf(
    db,
    liveRows.map((row) => row.id),
  );

  const featured = liveRows
    .filter((row) => row.featuredPosition !== null)
    .sort((a, b) => (a.featuredPosition ?? 0) - (b.featuredPosition ?? 0))
    .map((row) => ({ achievement: row, badge: badgeById.get(row.badgeId) }))
    .filter((row): row is { achievement: AchievementRow; badge: BadgeRow } => !!row.badge);

  // La misma regla está escrita como consulta en `unseenBadgesFor`, que no arma la colección: si
  // cambia acá, cambia allá. Que las dos respondan lo mismo lo fija `gh-points-view-reads.test.ts`.
  const unseen = liveRows
    .filter((row) => !row.historical && row.seenAt === null)
    .map((row) => ({
      achievement: row,
      badge: badgeById.get(row.badgeId),
      boosterKind: boosterByAchievement.get(row.id) ?? null,
    }))
    .filter(
      (
        row,
      ): row is { achievement: AchievementRow; badge: BadgeRow; boosterKind: BoosterKind | null } =>
        !!row.badge,
    );

  const terms = [
    ...new Set(allAchievements.map((row) => row.termId).filter((id): id is string => !!id)),
  ];

  return { families, specials, featured, unseen, terms };
}

/** El tipo de booster que dejó cada logro, por id del logro. */
async function boosterKindsOf(
  exec: Executor,
  achievementIds: string[],
): Promise<Map<string, BoosterKind>> {
  if (achievementIds.length === 0) {
    return new Map();
  }
  const rows = await exec
    .select({ sourceAchievementId: boosterItem.sourceAchievementId, kind: boosterItem.kind })
    .from(boosterItem)
    .where(inArray(boosterItem.sourceAchievementId, achievementIds));
  return new Map(
    rows
      .filter(
        (row): row is typeof row & { sourceAchievementId: string } => !!row.sourceAchievementId,
      )
      .map((row) => [row.sourceAchievementId, row.kind]),
  );
}

/**
 * Los logros que la persona todavía no ha visto, para el diálogo de desbloqueo: lo mismo que
 * `collectionFor(personId).unseen`, sin armar la colección ni leer la historia que la sostiene. Como
 * allá, cuenta el logro vivo, no histórico, sin ver y de una insignia activa, del más viejo al más
 * nuevo y con el tipo de booster que dejó.
 */
export async function unseenBadgesFor(personId: string): Promise<BadgeCollection["unseen"]> {
  const db = getDb();
  const rows = await db
    .select({ achievement, badge: badgeDefinition })
    .from(achievement)
    .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
    .where(
      and(
        eq(achievement.personId, personId),
        isNull(achievement.revokedAt),
        eq(achievement.historical, false),
        isNull(achievement.seenAt),
        eq(badgeDefinition.active, true),
      ),
    )
    .orderBy(asc(achievement.unlockedAt));
  const boosterByAchievement = await boosterKindsOf(
    db,
    rows.map((row) => row.achievement.id),
  );
  return rows.map((row) => ({
    achievement: row.achievement,
    badge: row.badge,
    boosterKind: boosterByAchievement.get(row.achievement.id) ?? null,
  }));
}

/** Las insignias destacadas de cada persona del directorio, en el orden de `featuredPosition`. */
export async function listFeaturedBadgesFor(
  personIds: string[],
): Promise<Map<string, Array<{ code: string; name: string; level: number; family: BadgeFamily }>>> {
  const result = new Map<
    string,
    Array<{ code: string; name: string; level: number; family: BadgeFamily }>
  >();
  if (personIds.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select({
      personId: achievement.personId,
      featuredPosition: achievement.featuredPosition,
      code: badgeDefinition.code,
      name: badgeDefinition.name,
      level: badgeDefinition.level,
      family: badgeDefinition.family,
    })
    .from(achievement)
    .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
    .where(
      and(
        inArray(achievement.personId, personIds),
        isNull(achievement.revokedAt),
        isNotNull(achievement.featuredPosition),
      ),
    )
    .orderBy(asc(achievement.featuredPosition));
  for (const row of rows) {
    const list = result.get(row.personId) ?? [];
    list.push({ code: row.code, name: row.name, level: row.level, family: row.family });
    result.set(row.personId, list);
  }
  return result;
}

/** Catálogo completo para GH con la cuenta de desbloqueos vivos por insignia. */
export async function listBadgeCatalogAdmin(): Promise<Array<BadgeRow & { unlocks: number }>> {
  const rows = await getDb()
    .select({
      badge: badgeDefinition,
      unlocks: sql<number>`count(${achievement.id}) filter (where ${achievement.revokedAt} is null)`,
    })
    .from(badgeDefinition)
    .leftJoin(achievement, eq(achievement.badgeId, badgeDefinition.id))
    .groupBy(badgeDefinition.id)
    .orderBy(asc(badgeDefinition.family), asc(badgeDefinition.level), asc(badgeDefinition.name));
  return rows.map((row) => ({ ...row.badge, unlocks: Number(row.unlocks) }));
}

/**
 * Logros revocados cuyo booster ya se había consumido (T-2549): GH revisa si hace falta un ajuste
 * manual porque el beneficio del logro ya se gastó.
 */
export async function listRevokedWithUsedBooster(termId?: string): Promise<
  Array<{
    achievement: AchievementRow;
    badge: BadgeRow;
    personId: string;
    personName: string;
  }>
> {
  const conditions = [isNotNull(achievement.revokedAt), eq(boosterItem.status, "CONSUMED")];
  if (termId) {
    conditions.push(eq(achievement.termId, termId));
  }
  const rows = await getDb()
    .select({ achievement, badge: badgeDefinition })
    .from(achievement)
    .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
    .innerJoin(boosterItem, eq(boosterItem.sourceAchievementId, achievement.id))
    .where(and(...conditions))
    .orderBy(desc(achievement.revokedAt));
  const people = await getPeopleByIds(rows.map((row) => row.achievement.personId));
  return rows.map((row) => ({
    achievement: row.achievement,
    badge: row.badge,
    personId: row.achievement.personId,
    personName: people.get(row.achievement.personId)?.fullName ?? "",
  }));
}

/** Todos los logros de la persona con su insignia (mis-datos, G-T6). */
export async function listAchievementsForPerson(
  personId: string,
): Promise<Array<AchievementRow & { badge: BadgeRow }>> {
  const rows = await getDb()
    .select({ achievement, badge: badgeDefinition })
    .from(achievement)
    .innerJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId))
    .where(eq(achievement.personId, personId))
    .orderBy(desc(achievement.unlockedAt));
  return rows.map((row) => ({ ...row.achievement, badge: row.badge }));
}
