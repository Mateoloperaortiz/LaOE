import { and, asc, eq, like } from "drizzle-orm";
import type { getDb } from "@/db/client";
import {
  assignStaffAs,
  type CompetitionActor,
  createAnnouncementAs,
  createCompetitionAs,
  createExtraAs,
  createMarketAs,
  createTeamAs,
  formatTeamCode,
  generateDayScheduleAs,
  getCompetitionBySlug,
  getLiveRotations,
  grantStartingCreditsAs,
  issueTeamCodesAs,
  saveBaseAs,
  setCompetitionStatusAs,
  setMarketOpenAs,
  updateCompetitionSettingsAs,
} from "@/modules/competition";
import { event, eventEdition } from "@/modules/events/schema";
import { membership, person } from "@/modules/people/schema";
import { logger } from "@/shared/log";

// Ensayo sintético de The Games (ADR-089 y ADR-091) para desarrollo y staging, sobre la edición
// «prueba» de Días EAFIT que siembra el seed. Tiene 30 equipos, 15 bases por jornada (la 5 y la 10
// son inflables), las dos jornadas generadas, la rúbrica de The Challenge, apuestas con 1000 puntos,
// un anuncio, un operador y dos jueces demo. Queda en vivo para verse en la vitrina con
// `?c=ensayo-the-games`. Se crea con los comandos del dominio, así que todo queda auditado.
// Idempotente por slug; nunca corre en producción.

type Db = ReturnType<typeof getDb>;

export const THE_GAMES_REHEARSAL_SLUG = "ensayo-the-games";
const ADMIN_EMAIL = "oe.demo.admin@eafit.edu.co";
const COLORS = ["#a53420", "#40658a", "#e3a419", "#8cbcd0", "#82261a", "#b89343"];
const MACRO_ORDERS = new Set([4, 9]);

async function demoStaff(db: Db, count: number): Promise<string[]> {
  const rows = await db
    .select({ id: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(and(like(person.email, "oe.demo.__@eafit.edu.co"), eq(membership.status, "ACTIVE")))
    .orderBy(asc(person.email))
    .limit(count);
  return rows.map((row) => row.id);
}

/** Siembra el ensayo; si ya existe, no toca nada. Devuelve el id de la competencia. */
export async function seedTheGames(
  db: Db,
  options: { rotationsPerDay?: number } = {},
): Promise<string | null> {
  const existing = await getCompetitionBySlug(THE_GAMES_REHEARSAL_SLUG);
  if (existing) {
    logger.info({ slug: existing.slug }, "ensayo de The Games ya sembrado");
    return existing.id;
  }
  const [edition] = await db
    .select({ id: eventEdition.id })
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(and(eq(event.slug, "dias-eafit"), eq(eventEdition.slug, "prueba")))
    .limit(1);
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, ADMIN_EMAIL))
    .limit(1);
  if (!edition || !admin) {
    logger.warn(
      "sin la edición «prueba» de Días EAFIT o sin el ADMIN demo: no se siembra The Games",
    );
    return null;
  }
  const actor: CompetitionActor = { personId: admin.id, isAdmin: true, ip: null };
  const { id } = await createCompetitionAs(actor, {
    editionId: edition.id,
    slug: THE_GAMES_REHEARSAL_SLUG,
    name: "Ensayo de The Games",
    isRehearsal: true,
  });
  await updateCompetitionSettingsAs(actor, id, {
    name: "Ensayo de The Games",
    firstDayOn: "2026-10-01",
    secondDayOn: "2026-10-02",
    bettingEnabled: true,
    startingCredits: 1000,
  });

  for (let number = 1; number <= 30; number++) {
    await createTeamAs(actor, id, {
      number,
      name: `Equipo de ensayo ${number}`,
      color: COLORS[number % COLORS.length] ?? null,
    });
  }
  const bases: Record<1 | 2, string[]> = { 1: [], 2: [] };
  for (const day of [1, 2] as const) {
    for (let orderIndex = 0; orderIndex < 15; orderIndex++) {
      const macro = MACRO_ORDERS.has(orderIndex);
      const base = await saveBaseAs(actor, id, null, {
        day,
        orderIndex,
        name: macro ? `Inflable ${orderIndex + 1}` : `Base ${orderIndex + 1}`,
        kind: macro ? "MACRO" : "NORMAL",
      });
      bases[day].push(base.id);
    }
  }

  const [operator, judgeOne, judgeTwo] = await demoStaff(db, 3);
  if (operator) await assignStaffAs(actor, id, { personId: operator, role: "OPERATOR" });
  if (judgeOne) {
    await assignStaffAs(actor, id, { personId: judgeOne, role: "JUDGE", baseId: bases[1][0] });
  }
  if (judgeTwo) {
    await assignStaffAs(actor, id, { personId: judgeTwo, role: "JUDGE", baseId: bases[2][0] });
  }

  await createExtraAs(actor, id, {
    name: "Competencia de talentos",
    day: 1,
    kind: "THE_CHALLENGE_RUBRIC",
  });
  await createAnnouncementAs(actor, id, {
    message: "Esto es un ensayo de The Games: los equipos y los resultados son de prueba.",
    level: "INFO",
  });

  const rotations = options.rotationsPerDay ?? 15;
  await generateDayScheduleAs(actor, id, { day: 1, rotations, plannedMinutes: 20 });
  await generateDayScheduleAs(actor, id, { day: 2, rotations, plannedMinutes: 45 });

  await grantStartingCreditsAs(actor, id);
  const { next } = await getLiveRotations(id);
  const inflable = next?.matchups.find((matchup) => matchup.base.kind === "MACRO");
  if (inflable) {
    const market = await createMarketAs(actor, id, {
      title: `¿Quién gana ${inflable.base.name} en la rotación 1?`,
      teamIds: [inflable.teamA.id, inflable.teamB.id],
    });
    await setMarketOpenAs(actor, id, market.id, true);
  }
  await setCompetitionStatusAs(actor, id, "LIVE");

  // Los códigos se muestran una sola vez, también aquí: son de ensayo y sirven para probar apuestas.
  const codes = await issueTeamCodesAs(actor, id, false);
  logger.info(
    {
      slug: THE_GAMES_REHEARSAL_SLUG,
      competitionId: id,
      codes: codes.map((item) => `${item.number}: ${formatTeamCode(item.code)}`),
    },
    "ensayo de The Games sembrado",
  );
  return id;
}
