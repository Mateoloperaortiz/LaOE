import { and, desc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { boosterGranted } from "@/domain-events/participation";
import { getTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { MAX_INPUT_COLLECTION_ITEMS } from "@/shared/lib/input-collections";
import {
  BOOSTER_STATES,
  type BoosterKind,
  type BoosterState,
  type CampaignPercent,
} from "../gamification-types";
import {
  achievement,
  badgeDefinition,
  boostCampaign,
  boosterItem,
  challenge,
  challengeParticipation,
  checkIn,
  occasion,
} from "../schema";
import { completeAttendanceCondition } from "./attendance-query";
import { listChallengesForMember, type MemberChallengeCard } from "./challenges";
import {
  audienceIncludes,
  boosterExpiresAt,
  boosterState,
  challengeState,
  isVoluntaryOccasion,
} from "./gamification-pure";
import type { GamificationSettings, MemberContext } from "./member-context";
import { listMemberAgenda } from "./occasions";

// Boosters personales y campañas de puntos (ADR-067 reglas 6 a 9): el booster nace de una insignia
// o de un otorgamiento manual, vence al terminar el término y se apunta a un reto o a una ocasión
// voluntaria con puntos. La campaña la crea GH por objetivo; si varias coinciden gana la mayor.

export type BoosterRow = typeof boosterItem.$inferSelect;
export type BoostCampaignRow = typeof boostCampaign.$inferSelect;

export interface BoosterTargetView {
  kind: "CHALLENGE" | "OCCASION";
  id: string;
  title: string;
  href: string;
}

export type BoosterOrigin =
  | { kind: "ACHIEVEMENT"; label: string }
  | { kind: "MANUAL"; reason: string };

export interface BoosterView {
  id: string;
  kind: BoosterKind;
  state: BoosterState;
  expiresAt: Date;
  target: BoosterTargetView | null;
  origin: BoosterOrigin | null;
}

const boosterErrors = () => tList("T-2466");

function stateLabel(state: BoosterState): string {
  return tLabels("T-2455", BOOSTER_STATES)[state] ?? state;
}

interface BoosterFetchRow {
  item: BoosterRow;
  badgeName: string | null;
  badgeLevel: number | null;
}

/** Junta los títulos de los objetivos apuntados y arma las vistas. */
async function decorateBoosters(rows: BoosterFetchRow[], now: Date): Promise<BoosterView[]> {
  const db = getDb();
  const challengeIds = [
    ...new Set(
      rows.map((row) => row.item.targetChallengeId).filter((id): id is string => id !== null),
    ),
  ];
  const occasionIds = [
    ...new Set(
      rows.map((row) => row.item.targetOccasionId).filter((id): id is string => id !== null),
    ),
  ];
  const [challenges, occasions] = await Promise.all([
    challengeIds.length > 0
      ? db
          .select({ id: challenge.id, title: challenge.title })
          .from(challenge)
          .where(inArray(challenge.id, challengeIds))
      : Promise.resolve([]),
    occasionIds.length > 0
      ? db
          .select({ id: occasion.id, title: occasion.title, publicId: occasion.publicId })
          .from(occasion)
          .where(inArray(occasion.id, occasionIds))
      : Promise.resolve([]),
  ]);
  const challengeById = new Map(challenges.map((row) => [row.id, row]));
  const occasionById = new Map(occasions.map((row) => [row.id, row]));
  return rows.map(({ item, badgeName, badgeLevel }) => {
    let target: BoosterTargetView | null = null;
    if (item.targetChallengeId) {
      const found = challengeById.get(item.targetChallengeId);
      if (found) {
        target = {
          kind: "CHALLENGE",
          id: found.id,
          title: found.title,
          href: `/app/gh-points/retos/${found.id}`,
        };
      }
    } else if (item.targetOccasionId) {
      const found = occasionById.get(item.targetOccasionId);
      if (found) {
        target = {
          kind: "OCCASION",
          id: found.id,
          title: found.title,
          href: `/a/${found.publicId}`,
        };
      }
    }
    let origin: BoosterOrigin | null = null;
    if (item.sourceAchievementId) {
      // La insignia se resuelve con su nivel; en G-T4 todavía no hay achievements.
      const level = t("T-2482", { nivel: badgeLevel ?? 1 });
      origin = { kind: "ACHIEVEMENT", label: badgeName ? `${badgeName} · ${level}` : level };
    } else if (item.grantedById) {
      origin = { kind: "MANUAL", reason: item.grantReason ?? "" };
    }
    return {
      id: item.id,
      kind: item.kind,
      state: boosterState(item, now),
      expiresAt: item.expiresAt,
      target,
      origin,
    };
  });
}

const boosterSelect = () =>
  getDb()
    .select({
      item: boosterItem,
      badgeName: badgeDefinition.name,
      badgeLevel: badgeDefinition.level,
    })
    .from(boosterItem)
    .leftJoin(achievement, eq(achievement.id, boosterItem.sourceAchievementId))
    .leftJoin(badgeDefinition, eq(badgeDefinition.id, achievement.badgeId));

/** Inventario del miembro: del más reciente al más viejo, con los retirados al final. */
export async function listBoostersFor(personId: string, now = new Date()): Promise<BoosterView[]> {
  const rows = (await boosterSelect()
    .where(eq(boosterItem.personId, personId))
    .orderBy(
      sql`case when ${boosterItem.status} = 'REVOKED' then 1 else 0 end`,
      desc(boosterItem.createdAt),
    )) as BoosterFetchRow[];
  return decorateBoosters(rows, now);
}

export interface BoosterAdminRow extends BoosterView {
  personId: string;
}

/** Boosters emitidos en el término (panel de GH): mismas vistas más la persona. */
export async function listBoostersForTerm(
  termId: string,
  now = new Date(),
): Promise<BoosterAdminRow[]> {
  const rows = (await boosterSelect()
    .where(eq(boosterItem.termId, termId))
    .orderBy(
      sql`case when ${boosterItem.status} = 'REVOKED' then 1 else 0 end`,
      desc(boosterItem.createdAt),
    )) as BoosterFetchRow[];
  const views = await decorateBoosters(rows, now);
  return views.map((view, index) => ({
    ...view,
    personId: rows[index]?.item.personId ?? "",
  }));
}

// Apuntar un booster (ADR-067 regla 8): un objetivo por booster y un booster por objetivo.

export interface BoosterTarget {
  challengeId?: string;
  occasionId?: string;
}

export async function setBoosterTarget(
  ctx: CommandContext,
  input: {
    personId: string;
    boosterId: string;
    target: BoosterTarget | null;
    now?: Date | undefined;
    /** El check-in válido continúa si otra entrega ya reservó o consumió el booster propio. */
    allowUnavailable?: boolean;
    /**
     * La asistencia que se está registrando con este booster (ADR-119 regla 3): ya está insertada
     * cuando se apunta y no cuenta como participación previa en su ocasión.
     */
    forCheckInId?: string | undefined;
  },
  context: { member: MemberContext | null; settings: GamificationSettings },
): Promise<BoosterRow> {
  if (!context.settings.enabled) {
    throw new DomainError(t("T-2442"));
  }
  const now = input.now ?? new Date();
  const errors = boosterErrors();
  const [row] = await ctx.tx
    .select()
    .from(boosterItem)
    .where(and(eq(boosterItem.id, input.boosterId), eq(boosterItem.personId, input.personId)))
    .for("update");
  if (!row || row.status === "REVOKED") {
    throw new DomainError(t("T-032"));
  }
  const state = boosterState(row, now);
  if (input.allowUnavailable && (state === "RESERVED" || state === "CONSUMED")) {
    return row;
  }
  if (state === "EXPIRED") {
    throw new DomainError(errors[1] ?? "");
  }
  if (state !== "AVAILABLE") {
    throw new DomainError(errors[2] ?? "");
  }
  const before = {
    targetChallengeId: row.targetChallengeId,
    targetOccasionId: row.targetOccasionId,
  };

  if (input.target === null) {
    await ctx.tx
      .update(boosterItem)
      .set({ targetChallengeId: null, targetOccasionId: null })
      .where(eq(boosterItem.id, row.id));
    await ctx.audit({
      action: "booster.targeted",
      entityType: "booster_item",
      entityId: row.id,
      before,
      after: { targetChallengeId: null, targetOccasionId: null },
    });
    return { ...row, targetChallengeId: null, targetOccasionId: null };
  }

  const challengeId = input.target.challengeId ?? null;
  const occasionId = input.target.occasionId ?? null;
  if ((!challengeId && !occasionId) || (challengeId && occasionId)) {
    throw new DomainError(errors[3] ?? "");
  }

  if (challengeId) {
    const [target] = await ctx.tx
      .select()
      .from(challenge)
      .where(eq(challenge.id, challengeId))
      .limit(1);
    const state = target ? challengeState(target, now) : null;
    const valid =
      target !== undefined &&
      target.status === "PUBLISHED" &&
      (state === "SCHEDULED" || state === "OPEN") &&
      target.basePoints > 0 &&
      audienceIncludes(target, context.member);
    if (!valid) {
      throw new DomainError(errors[3] ?? "");
    }
    const [participation] = await ctx.tx
      .select({ id: challengeParticipation.id })
      .from(challengeParticipation)
      .where(
        and(
          eq(challengeParticipation.challengeId, challengeId),
          eq(challengeParticipation.personId, input.personId),
        ),
      )
      .limit(1);
    if (participation) {
      throw new DomainError(errors[4] ?? "");
    }
  } else if (occasionId) {
    const [target] = await ctx.tx
      .select()
      .from(occasion)
      .where(eq(occasion.id, occasionId))
      .limit(1);
    const valid =
      target !== undefined &&
      (target.status === "DRAFT" || target.status === "OPEN") &&
      isVoluntaryOccasion(target) &&
      target.points > 0 &&
      target.checkInClosesAt > now;
    if (!valid) {
      throw new DomainError(errors[3] ?? "");
    }
    // Un check-in rechazado o anulado no cuenta como participación: la reaprobación
    // posterior puede volver a necesitar el booster apuntado.
    const [existing] = await ctx.tx
      .select({ id: checkIn.id })
      .from(checkIn)
      .where(
        and(
          eq(checkIn.occasionId, occasionId),
          eq(checkIn.personId, input.personId),
          inArray(checkIn.status, ["PENDING", "APPROVED"]),
          completeAttendanceCondition(),
          input.forCheckInId ? ne(checkIn.id, input.forCheckInId) : undefined,
        ),
      )
      .limit(1);
    if (existing) {
      throw new DomainError(errors[4] ?? "");
    }
  }

  // Otro booster propio ya apuntado al mismo objetivo (el índice único es el respaldo).
  const [conflict] = await ctx.tx
    .select({ id: boosterItem.id })
    .from(boosterItem)
    .where(
      and(
        eq(boosterItem.personId, input.personId),
        ne(boosterItem.status, "REVOKED"),
        ne(boosterItem.id, row.id),
        challengeId
          ? eq(boosterItem.targetChallengeId, challengeId)
          : eq(boosterItem.targetOccasionId, occasionId ?? ""),
      ),
    )
    .limit(1);
  if (conflict) {
    throw new DomainError(errors[0] ?? "");
  }
  try {
    await ctx.tx
      .update(boosterItem)
      .set({ targetChallengeId: challengeId, targetOccasionId: occasionId })
      .where(eq(boosterItem.id, row.id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(errors[0] ?? "");
    }
    throw error;
  }
  await ctx.audit({
    action: "booster.targeted",
    entityType: "booster_item",
    entityId: row.id,
    before,
    after: { targetChallengeId: challengeId, targetOccasionId: occasionId },
  });
  return { ...row, targetChallengeId: challengeId, targetOccasionId: occasionId };
}

/** Retos y actividades a los que el miembro puede apuntar un booster ahora. */
export async function listBoosterTargetsForMember(
  personId: string,
  termId: string,
  now = new Date(),
): Promise<{
  challenges: MemberChallengeCard[];
  occasions: Array<{ id: string; publicId: string; title: string; startsAt: Date; points: number }>;
}> {
  const cards = await listChallengesForMember(personId, termId, now);
  const challenges = cards.filter(
    (card) =>
      (card.state === "OPEN" || card.state === "SCHEDULED") &&
      card.basePoints > 0 &&
      card.status === "AVAILABLE",
  );
  const agenda = await listMemberAgenda(termId, now, 50);
  const voluntary = agenda.filter((row) => isVoluntaryOccasion(row) && row.points > 0);
  const occasionIds = voluntary.map((row) => row.id);
  const checked = occasionIds.length
    ? await getDb()
        .select({ occasionId: checkIn.occasionId })
        .from(checkIn)
        .where(
          and(
            eq(checkIn.personId, personId),
            inArray(checkIn.occasionId, occasionIds),
            inArray(checkIn.status, ["PENDING", "APPROVED"]),
            completeAttendanceCondition(),
          ),
        )
    : [];
  const used = new Set(checked.map((row) => row.occasionId));
  return {
    challenges,
    occasions: voluntary
      .filter((row) => !used.has(row.id))
      .map((row) => ({
        id: row.id,
        publicId: row.publicId,
        title: row.title,
        startsAt: row.startsAt,
        points: row.points,
      })),
  };
}

// Otorgamiento y retiro por GH.

export async function grantBoosterManually(
  ctx: CommandContext,
  input: { personId: string; termId: string; kind: BoosterKind; reason: string },
): Promise<BoosterRow> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(t("T-2564"), "reason");
  }
  const term = await getTerm(input.termId, ctx.tx);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  const [row] = await ctx.tx
    .insert(boosterItem)
    .values({
      personId: input.personId,
      termId: input.termId,
      kind: input.kind,
      expiresAt: boosterExpiresAt(term),
      grantedById: ctx.actor.personId,
      grantReason: reason,
    })
    .returning();
  if (!row) {
    throw new Error("No se pudo otorgar el booster");
  }
  await ctx.audit({
    action: "booster.granted",
    entityType: "booster_item",
    entityId: row.id,
    after: {
      personId: input.personId,
      termId: input.termId,
      kind: input.kind,
      source: "MANUAL",
      reason,
    },
  });
  await ctx.emit(
    eventOf(boosterGranted, {
      boosterId: row.id,
      personId: input.personId,
      termId: input.termId,
      kind: input.kind,
      source: "MANUAL",
    }),
  );
  return row;
}

/** Booster que nace de una insignia (G-T5): idempotente por `sourceAchievementId`. */
export async function grantBoosterForAchievement(
  ctx: CommandContext,
  input: { personId: string; termId: string; achievementId: string; level: number },
): Promise<BoosterRow | null> {
  const kind: BoosterKind = input.level >= 3 ? "PLUS_100" : "PLUS_50";
  const term = await getTerm(input.termId, ctx.tx);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  const [row] = await ctx.tx
    .insert(boosterItem)
    .values({
      personId: input.personId,
      termId: input.termId,
      kind,
      expiresAt: boosterExpiresAt(term),
      sourceAchievementId: input.achievementId,
    })
    .onConflictDoNothing({
      target: boosterItem.sourceAchievementId,
      where: sql`${boosterItem.sourceAchievementId} is not null`,
    })
    .returning();
  if (!row) {
    return null;
  }
  await ctx.audit({
    action: "booster.granted",
    entityType: "booster_item",
    entityId: row.id,
    after: {
      personId: input.personId,
      termId: input.termId,
      kind,
      source: "ACHIEVEMENT",
      achievementId: input.achievementId,
    },
  });
  await ctx.emit(
    eventOf(boosterGranted, {
      boosterId: row.id,
      personId: input.personId,
      termId: input.termId,
      kind,
      source: "ACHIEVEMENT",
    }),
  );
  return row;
}

export async function revokeBooster(
  ctx: CommandContext,
  input: { boosterId: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(t("T-2564"), "reason");
  }
  const [row] = await ctx.tx
    .select()
    .from(boosterItem)
    .where(eq(boosterItem.id, input.boosterId))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === "REVOKED") {
    return;
  }
  if (row.status !== "AVAILABLE") {
    throw new DomainError(t("T-676", { estado: stateLabel(row.status).toLowerCase() }));
  }
  const now = new Date();
  await ctx.tx
    .update(boosterItem)
    .set({
      status: "REVOKED",
      revokedAt: now,
      revokedById: ctx.actor.personId,
      revokeReason: reason,
      targetChallengeId: null,
      targetOccasionId: null,
    })
    .where(eq(boosterItem.id, row.id));
  await ctx.audit({
    action: "booster.revoked",
    entityType: "booster_item",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "REVOKED", reason },
  });
}

// Campañas de puntos (ADR-067 regla 9): una fila por objetivo; vigencia por ventana en UTC.

export const campaignInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  percent: z.coerce.number().pipe(z.union([z.literal(25), z.literal(50), z.literal(100)])),
  challengeIds: z
    .array(z.string().trim().min(1).max(80))
    .max(MAX_INPUT_COLLECTION_ITEMS, { message: t("T-260") })
    .default([]),
  occasionIds: z
    .array(z.string().trim().min(1).max(80))
    .max(MAX_INPUT_COLLECTION_ITEMS, { message: t("T-260") })
    .default([]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

const campaignErrors = () => tList("T-2539");

export async function createCampaigns(
  ctx: CommandContext,
  input: CampaignInput,
  context: { termId: string },
): Promise<{ ids: string[] }> {
  const errors = campaignErrors();
  const challengeIds = [...new Set(input.challengeIds)];
  const occasionIds = [...new Set(input.occasionIds)];
  if (challengeIds.length + occasionIds.length === 0) {
    throw new DomainError(errors[0] ?? "", "challengeIds");
  }
  if (!(input.startsAt < input.endsAt)) {
    throw new DomainError(errors[1] ?? "", "endsAt");
  }
  const challenges = challengeIds.length
    ? await ctx.tx
        .select({ id: challenge.id, termId: challenge.termId, status: challenge.status })
        .from(challenge)
        .where(inArray(challenge.id, challengeIds))
    : [];
  const occasions = occasionIds.length
    ? await ctx.tx
        .select({ id: occasion.id, termId: occasion.termId, status: occasion.status })
        .from(occasion)
        .where(inArray(occasion.id, occasionIds))
    : [];
  const invalidChallenge =
    challenges.length !== challengeIds.length ||
    challenges.some((row) => row.termId !== context.termId || row.status === "CANCELLED");
  const invalidOccasion =
    occasions.length !== occasionIds.length ||
    occasions.some((row) => row.termId !== context.termId || row.status === "CANCELLED");
  if (invalidChallenge || invalidOccasion) {
    throw new DomainError(errors[2] ?? "");
  }
  const ids: string[] = [];
  for (const id of challengeIds) {
    const [row] = await ctx.tx
      .insert(boostCampaign)
      .values({
        termId: context.termId,
        name: input.name,
        percent: input.percent,
        challengeId: id,
        occasionId: null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: ctx.actor.personId,
      })
      .returning({ id: boostCampaign.id });
    if (row) {
      ids.push(row.id);
      await ctx.audit({
        action: "campaign.created",
        entityType: "boost_campaign",
        entityId: row.id,
        after: { ...input, target: { challengeId: id } },
      });
    }
  }
  for (const id of occasionIds) {
    const [row] = await ctx.tx
      .insert(boostCampaign)
      .values({
        termId: context.termId,
        name: input.name,
        percent: input.percent,
        challengeId: null,
        occasionId: id,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: ctx.actor.personId,
      })
      .returning({ id: boostCampaign.id });
    if (row) {
      ids.push(row.id);
      await ctx.audit({
        action: "campaign.created",
        entityType: "boost_campaign",
        entityId: row.id,
        after: { ...input, target: { occasionId: id } },
      });
    }
  }
  return { ids };
}

export async function cancelCampaign(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(boostCampaign)
    .where(eq(boostCampaign.id, id))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status === "CANCELLED") {
    return;
  }
  const now = new Date();
  await ctx.tx
    .update(boostCampaign)
    .set({ status: "CANCELLED", cancelledAt: now })
    .where(eq(boostCampaign.id, row.id));
  await ctx.audit({
    action: "campaign.cancelled",
    entityType: "boost_campaign",
    entityId: row.id,
    before: { status: row.status },
    after: { status: "CANCELLED" },
  });
}

export type CampaignAdminState = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";

export interface CampaignAdminRow extends BoostCampaignRow {
  targetTitle: string;
  state: CampaignAdminState;
}

/** Campañas del término para el panel, con el estado derivado de la ventana. */
export async function listCampaignsAdmin(
  termId: string,
  now = new Date(),
): Promise<CampaignAdminRow[]> {
  const rows = await getDb()
    .select({
      campaign: boostCampaign,
      challengeTitle: challenge.title,
      occasionTitle: occasion.title,
    })
    .from(boostCampaign)
    .leftJoin(challenge, eq(challenge.id, boostCampaign.challengeId))
    .leftJoin(occasion, eq(occasion.id, boostCampaign.occasionId))
    .where(eq(boostCampaign.termId, termId))
    .orderBy(desc(boostCampaign.createdAt));
  return rows.map(({ campaign, challengeTitle, occasionTitle }) => ({
    ...campaign,
    targetTitle: challengeTitle ?? occasionTitle ?? "—",
    state:
      campaign.status === "CANCELLED"
        ? "CANCELLED"
        : campaign.startsAt > now
          ? "SCHEDULED"
          : campaign.endsAt > now
            ? "ACTIVE"
            : "ENDED",
  }));
}

export interface MemberCampaignView {
  id: string;
  percent: CampaignPercent;
  endsAt: Date;
  target: BoosterTargetView;
}

/** Campañas vigentes del término para el miembro, con el objetivo enlazado. */
export async function listActiveCampaignsForMember(
  termId: string,
  now = new Date(),
): Promise<MemberCampaignView[]> {
  const rows = await getDb()
    .select({
      id: boostCampaign.id,
      percent: boostCampaign.percent,
      endsAt: boostCampaign.endsAt,
      challengeId: boostCampaign.challengeId,
      occasionId: boostCampaign.occasionId,
      challengeTitle: challenge.title,
      occasionTitle: occasion.title,
      occasionPublicId: occasion.publicId,
    })
    .from(boostCampaign)
    .leftJoin(challenge, eq(challenge.id, boostCampaign.challengeId))
    .leftJoin(occasion, eq(occasion.id, boostCampaign.occasionId))
    .where(
      and(
        eq(boostCampaign.termId, termId),
        eq(boostCampaign.status, "ACTIVE"),
        lte(boostCampaign.startsAt, now),
        gt(boostCampaign.endsAt, now),
      ),
    )
    .orderBy(boostCampaign.endsAt);
  return rows.flatMap((row): MemberCampaignView[] => {
    if (row.challengeId && row.challengeTitle) {
      return [
        {
          id: row.id,
          percent: row.percent as CampaignPercent,
          endsAt: row.endsAt,
          target: {
            kind: "CHALLENGE" as const,
            id: row.challengeId,
            title: row.challengeTitle,
            href: `/app/gh-points/retos/${row.challengeId}`,
          },
        },
      ];
    }
    if (row.occasionId && row.occasionTitle && row.occasionPublicId) {
      return [
        {
          id: row.id,
          percent: row.percent as CampaignPercent,
          endsAt: row.endsAt,
          target: {
            kind: "OCCASION" as const,
            id: row.occasionId,
            title: row.occasionTitle,
            href: `/a/${row.occasionPublicId}`,
          },
        },
      ];
    }
    return [];
  });
}
