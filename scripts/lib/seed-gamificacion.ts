import { and, asc, eq } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createCampaigns, grantBoosterManually } from "@/modules/participation/domain/boosters";
import { createChallenge, publishChallenge } from "@/modules/participation/domain/challenges";
import { setGamificationEnabledAs } from "@/modules/participation/domain/gamification-launch";
import { boostCampaign, boosterItem, challenge, occasion } from "@/modules/participation/schema";
import { membership, person } from "@/modules/people/schema";
import { logger } from "@/shared/log";

// Datos sintéticos de la gamificación (ADR-067): la activación, un reto publicado por formato
// (trivia, misión con evidencia y presencial sobre una ocasión sintética con puntos), una
// campaña +50 % sobre la trivia y un Impulso para el primer miembro demo. Idempotente por
// publicId, título, nombre de campaña y motivo del booster; nunca corre en producción.

type Db = ReturnType<typeof getDb>;

const DAY = 24 * 60 * 60_000;
const OCCASION_PUBLIC_ID = "gamdemo001";
const TRIVIA_TITLE = "Trivia sintética de la OE";
const EVIDENCE_TITLE = "Misión sintética con evidencia";
const PRESENTIAL_TITLE = "Reto sintético presencial";
const CAMPAIGN_NAME = "Campaña sintética +50 %";
const BOOSTER_REASON = "Semilla sintética de desarrollo";

async function seedOccasion(db: Db, termId: string): Promise<string> {
  const [found] = await db
    .select({ id: occasion.id })
    .from(occasion)
    .where(eq(occasion.publicId, OCCASION_PUBLIC_ID))
    .limit(1);
  if (found) return found.id;
  const now = Date.now();
  const [row] = await db
    .insert(occasion)
    .values({
      publicId: OCCASION_PUBLIC_ID,
      termId,
      kind: "ACTIVITY",
      category: "OTHER",
      title: "Actividad sintética de gamificación",
      description: "Ocasión de prueba para el reto presencial.",
      startsAt: new Date(now + DAY),
      endsAt: new Date(now + DAY + 2 * 3_600_000),
      checkInOpensAt: new Date(now + DAY - 3_600_000),
      checkInClosesAt: new Date(now + DAY + 3 * 3_600_000),
      points: 10,
      status: "OPEN",
    })
    .returning({ id: occasion.id });
  if (!row) throw new Error("seed gamificación: ocasión sin fila");
  return row.id;
}

async function challengeByTitle(db: Db, termId: string, title: string) {
  const [row] = await db
    .select({ id: challenge.id })
    .from(challenge)
    .where(and(eq(challenge.termId, termId), eq(challenge.title, title)))
    .limit(1);
  return row?.id ?? null;
}

async function seedChallenge(
  db: Db,
  termId: string,
  input: Parameters<typeof createChallenge>[1],
  title: string,
): Promise<string> {
  const existing = await challengeByTitle(db, termId, title);
  if (existing) return existing;
  const id = await runCommand(SYSTEM_ACTOR, async (ctx) => {
    const { id } = await createChallenge(ctx, input, {
      termId,
      defaultPassPercent: 80,
    });
    await publishChallenge(ctx, id);
    return id;
  });
  return id;
}

export async function seedGamificacion(db: Db, termId: string): Promise<void> {
  await setGamificationEnabledAs(SYSTEM_ACTOR, true);

  const occasionId = await seedOccasion(db, termId);
  const now = Date.now();
  const opensAt = new Date(now - 3_600_000);
  const closesAt = new Date(now + 30 * DAY);

  const triviaId = await seedChallenge(
    db,
    termId,
    {
      kind: "TRIVIA",
      title: TRIVIA_TITLE,
      description: "Tres preguntas de prueba sobre la OE.",
      audience: "ALL",
      audienceCommitteeIds: [],
      opensAt,
      closesAt,
      basePoints: 5,
      passPercent: 80,
      occasionId: null,
      questions: [
        {
          prompt: "¿Qué sigla identifica a la organización?",
          options: ["OE", "GH", "DAE"],
          correctIndex: 0,
        },
        {
          prompt: "¿Qué se gana al participar?",
          options: ["GH Points", "Créditos", "Descuentos"],
          correctIndex: 0,
        },
        {
          prompt: "¿Dónde vive la colección de insignias?",
          options: ["En Mi OE", "En el correo", "En la cartelera"],
          correctIndex: 0,
        },
      ],
    },
    TRIVIA_TITLE,
  );

  await seedChallenge(
    db,
    termId,
    {
      kind: "EVIDENCE",
      title: EVIDENCE_TITLE,
      description: "Subí una foto de prueba participando en una actividad.",
      audience: "ALL",
      audienceCommitteeIds: [],
      opensAt,
      closesAt,
      basePoints: 10,
      passPercent: null,
      occasionId: null,
      questions: [],
    },
    EVIDENCE_TITLE,
  );

  await seedChallenge(
    db,
    termId,
    {
      kind: "PRESENTIAL",
      title: PRESENTIAL_TITLE,
      description: "Hacé check-in en la actividad sintética de gamificación.",
      audience: "ALL",
      audienceCommitteeIds: [],
      opensAt,
      closesAt: new Date(now + 31 * DAY),
      basePoints: 10,
      passPercent: null,
      occasionId,
      questions: [],
    },
    PRESENTIAL_TITLE,
  );

  const [campaign] = await db
    .select({ id: boostCampaign.id })
    .from(boostCampaign)
    .where(and(eq(boostCampaign.termId, termId), eq(boostCampaign.name, CAMPAIGN_NAME)))
    .limit(1);
  if (!campaign) {
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCampaigns(
        ctx,
        {
          name: CAMPAIGN_NAME,
          percent: 50,
          challengeIds: [triviaId],
          occasionIds: [],
          startsAt: opensAt,
          endsAt: closesAt,
        },
        { termId },
      ),
    );
  }

  const [member] = await db
    .select({ id: person.id })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(and(eq(person.source, "SEED"), eq(membership.status, "ACTIVE")))
    .orderBy(asc(person.email))
    .limit(1);
  if (member) {
    const [existing] = await db
      .select({ id: boosterItem.id })
      .from(boosterItem)
      .where(
        and(
          eq(boosterItem.personId, member.id),
          eq(boosterItem.termId, termId),
          eq(boosterItem.grantReason, BOOSTER_REASON),
        ),
      )
      .limit(1);
    if (!existing) {
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        grantBoosterManually(ctx, {
          personId: member.id,
          termId,
          kind: "PLUS_50",
          reason: BOOSTER_REASON,
        }),
      );
    }
  }
  logger.info({ termId }, "gamificación sintética sembrada");
}
