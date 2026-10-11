import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  advanceRotationAs,
  type CompetitionActor,
  clearRouteMemo,
  clearShowcaseMemo,
  closeRotationAs,
  createCompetitionAs,
  createTeamAs,
  declarePowerAs,
  deleteDayScheduleAs,
  deliverPowerGrantsAs,
  generateDayScheduleAs,
  getLiveRotations,
  getShowcase,
  importPowerGrantsAs,
  listPowerBoard,
  saveBaseAs,
  setCompetitionStatusAs,
  startRotationAs,
} from "@/modules/competition";
import {
  competitionBase,
  competitionMatchup,
  competitionRotation,
} from "@/modules/competition/schema";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedMember } from "../factories";
import { truncateAll } from "./db";

// El error del operador de DT-264, de punta a punta y por los comandos: con la jornada 1 a medias y
// sin rotación en curso, inicia a mano una rotación de la jornada 2. Estas pruebas no corrigen nada:
// fijan lo que pasa HOY, para que quien elija el arreglo (que «Avanzar» nombre la rotación, pedir
// confirmación al iniciar una de otra jornada, o un comando que devuelva a pendiente una rotación
// iniciada sin resultados) lo cambie a sabiendas. Esa elección es diseño del operador y sigue en la
// fila del ledger. La regla de «la que sigue» es ADR-118 regla 28; la de las tarjetas, ADR-098.

const SLUG = "the-games-2026";

async function seedEdition(): Promise<string> {
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "dias-eafit",
      name: "Días EAFIT",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return edicion.id;
}

type Place = "J1-R1" | "J1-R2" | "J1-R3" | "J2-R1" | "J2-R2";

const TEAMS = 30;
const BASES_PER_DAY = 15;
/** Las tarjetas del jueves: tres a cada equipo impar y dos a cada par. */
const DAY_ONE_CARDS = 75;

/**
 * Una competencia en vivo del tamaño de la de verdad (30 equipos y 15 bases por jornada, la 5 y la 10
 * inflables), con tres rotaciones el jueves y dos el viernes y las tarjetas del jueves entregadas.
 * Ya se jugó y se cerró la primera rotación del jueves: quedan dos pendientes y ninguna en curso.
 */
async function seedMidDayOne() {
  const adminId = await seedMember("operador-jornadas@example.com");
  const actor: CompetitionActor = { personId: adminId, isAdmin: true, ip: "10.0.0.1" };
  const { id } = await createCompetitionAs(actor, {
    editionId: await seedEdition(),
    slug: SLUG,
    name: "The Games 2026",
  });
  for (let n = 1; n <= TEAMS; n++) {
    await createTeamAs(actor, id, { number: n, name: `Equipo ${n}` });
  }
  for (const day of [1, 2] as const) {
    for (let i = 0; i < BASES_PER_DAY; i++) {
      await saveBaseAs(actor, id, null, {
        day,
        orderIndex: i,
        name: `Base ${day}-${i + 1}`,
        kind: i === 4 || i === 9 ? "MACRO" : "NORMAL",
      });
    }
  }
  await generateDayScheduleAs(actor, id, { day: 1, rotations: 3, plannedMinutes: 20 });
  await generateDayScheduleAs(actor, id, { day: 2, rotations: 2, plannedMinutes: 20 });
  const sheet = Array.from({ length: TEAMS }, (_, index) => index + 1)
    .flatMap((n) => [
      `${n}\tMultiplicador x2\tjueves`,
      `${n}\tCambio de resultados\tjueves`,
      n % 2 === 1 ? `${n}\tCancelar poder\tjueves` : `${n}\tx2\tviernes`,
      `${n}\t1 min tarde\tviernes`,
      `${n}\tUn jugador menos\tviernes`,
    ])
    .join("\n");
  await importPowerGrantsAs(actor, id, { text: sheet });
  await deliverPowerGrantsAs(actor, id, { day: 1 });
  await setCompetitionStatusAs(actor, id, "LIVE");

  const rows = await getDb()
    .select({
      id: competitionRotation.id,
      day: competitionRotation.day,
      number: competitionRotation.number,
    })
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, id))
    .orderBy(asc(competitionRotation.day), asc(competitionRotation.number));
  const seenPerDay = new Map<number, number>();
  const places = rows.map((row) => {
    const nth = (seenPerDay.get(row.day) ?? 0) + 1;
    seenPerDay.set(row.day, nth);
    return { ...row, place: `J${row.day}-R${nth}` as Place };
  });
  const idOf = (place: Place) => places.find((row) => row.place === place)?.id ?? "";
  const placeOf = (rotation: { day: number; number: number } | null | undefined) =>
    places.find((row) => row.day === rotation?.day && row.number === rotation.number)?.place ??
    null;

  /** Lo que ven el operador, la vitrina y el panel de poderes, y cómo quedó cada rotación. */
  const state = async () => {
    const statuses = await getDb()
      .select({ id: competitionRotation.id, status: competitionRotation.status })
      .from(competitionRotation)
      .where(eq(competitionRotation.competitionId, id));
    const live = await getLiveRotations(id);
    clearShowcaseMemo();
    const showcase = await getShowcase(SLUG, new Date());
    const dayOneCards: Record<string, number> = {};
    for (const team of (await listPowerBoard(id)).teams) {
      for (const grant of team.grants.filter((item) => item.day === 1)) {
        dayOneCards[grant.state] = (dayOneCards[grant.state] ?? 0) + 1;
      }
    }
    return {
      rotations: Object.fromEntries(
        places.map((row) => [row.place, statuses.find((item) => item.id === row.id)?.status]),
      ),
      operator: { current: placeOf(live.current), next: placeOf(live.next) },
      showcase: {
        current: placeOf(showcase?.currentRotation),
        next: placeOf(showcase?.nextRotation),
      },
      dayOneCards,
    };
  };

  // El jueves arranca con «Avanzar» y su primera rotación se juega y se cierra.
  expect(await advanceRotationAs(actor, id)).toEqual({ rotationId: idOf("J1-R1") });
  await closeRotationAs(actor, id, idOf("J1-R1"));

  return { id, actor, idOf, state };
}

describe("The Games: el operador inicia a mano una rotación de otra jornada (DT-264)", () => {
  beforeEach(async () => {
    await truncateAll();
    clearShowcaseMemo();
    clearRouteMemo();
  });
  afterAll(() => closeDb());

  it("hoy se acepta sin aviso, y el panel, la vitrina y las tarjetas dan por terminada la jornada 1", async () => {
    const { id, actor, idOf, state } = await seedMidDayOne();
    expect(await state()).toEqual({
      rotations: {
        "J1-R1": "CLOSED",
        "J1-R2": "PENDING",
        "J1-R3": "PENDING",
        "J2-R1": "PENDING",
        "J2-R2": "PENDING",
      },
      operator: { current: null, next: "J1-R2" },
      showcase: { current: null, next: "J1-R2" },
      dayOneCards: { DELIVERED: DAY_ONE_CARDS },
    });

    // El clic equivocado: «Iniciar» en la primera del viernes y no en la segunda del jueves.
    await expect(startRotationAs(actor, id, idOf("J2-R1"))).resolves.toBeUndefined();

    expect(await state()).toEqual({
      rotations: {
        "J1-R1": "CLOSED",
        "J1-R2": "PENDING",
        "J1-R3": "PENDING",
        "J2-R1": "ACTIVE",
        "J2-R2": "PENDING",
      },
      operator: { current: "J2-R1", next: "J2-R2" },
      showcase: { current: "J2-R1", next: "J2-R2" },
      dayOneCards: { EXPIRED: DAY_ONE_CARDS },
    });
    // Lo único que queda del clic es un inicio como cualquier otro en la auditoría.
    const starts = await getDb()
      .select({ entityId: auditLog.entityId })
      .from(auditLog)
      .where(eq(auditLog.action, "competition.rotation.start"));
    expect(starts.map((row) => row.entityId).sort()).toEqual([idOf("J1-R1"), idOf("J2-R1")].sort());
  });

  it("hoy ese inicio no tiene vuelta por ningún comando: la rotación se cierra y se reabre, pero no vuelve a pendiente, y el calendario de la jornada 2 ya no se borra", async () => {
    const { id, actor, idOf, state } = await seedMidDayOne();
    await startRotationAs(actor, id, idOf("J2-R1"));

    // Cerrarla no deshace nada: queda cerrada, y la que sigue es la otra del viernes.
    await closeRotationAs(actor, id, idOf("J2-R1"));
    const closed = await state();
    expect(closed.rotations["J2-R1"]).toBe("CLOSED");
    expect(closed.operator).toEqual({ current: null, next: "J2-R2" });
    expect(closed.showcase).toEqual({ current: null, next: "J2-R2" });
    expect(closed.dayOneCards).toEqual({ EXPIRED: DAY_ONE_CARDS });

    // Borrar el calendario del viernes para rehacerlo tampoco: lo rechaza por la rotación iniciada,
    // con el texto de «ya tiene resultados» aunque no hay ninguno. Y regenerarlo, por existir.
    await expect(deleteDayScheduleAs(actor, id, 2)).rejects.toThrow(t("T-2772", { dia: 2 }));
    await expect(
      generateDayScheduleAs(actor, id, { day: 2, rotations: 2, plannedMinutes: 20 }),
    ).rejects.toThrow(t("T-2771", { dia: 2 }));

    // Iniciarla otra vez la reabre: va de cerrada a en curso y de vuelta, nunca a pendiente.
    await startRotationAs(actor, id, idOf("J2-R1"));
    expect((await state()).rotations["J2-R1"]).toBe("ACTIVE");
    await closeRotationAs(actor, id, idOf("J2-R1"));
    expect((await state()).rotations).toEqual({
      "J1-R1": "CLOSED",
      "J1-R2": "PENDING",
      "J1-R3": "PENDING",
      "J2-R1": "CLOSED",
      "J2-R2": "PENDING",
    });
  });

  it("hoy «Avanzar» ya no vuelve a la jornada 1: sus pendientes se inician a mano una por una, y sus tarjetas salen vencidas en el panel aunque el servidor todavía las recibe", async () => {
    const { id, actor, idOf, state } = await seedMidDayOne();
    await startRotationAs(actor, id, idOf("J2-R1"));

    // «Avanzar» cierra la del viernes y sigue con el viernes.
    expect(await advanceRotationAs(actor, id)).toEqual({ rotationId: idOf("J2-R2") });
    // Sin más rotaciones el viernes, «Avanzar» cierra y no inicia nada: para el panel y la vitrina no
    // hay siguiente, con dos rotaciones del jueves sin jugar.
    expect(await advanceRotationAs(actor, id)).toEqual({ rotationId: null });
    expect(await state()).toEqual({
      rotations: {
        "J1-R1": "CLOSED",
        "J1-R2": "PENDING",
        "J1-R3": "PENDING",
        "J2-R1": "CLOSED",
        "J2-R2": "CLOSED",
      },
      operator: { current: null, next: null },
      showcase: { current: null, next: null },
      dayOneCards: { EXPIRED: DAY_ONE_CARDS },
    });

    // Las del jueves siguen ahí, pero cada una se inicia a mano: «Avanzar» cierra la que está en
    // curso y no pasa a la otra.
    await startRotationAs(actor, id, idOf("J1-R2"));
    expect((await state()).operator).toEqual({ current: "J1-R2", next: null });

    // Las tarjetas del jueves ya salen vencidas en el panel, también con una rotación del jueves en
    // curso. El comando no mira eso: la tarjeta entregada se registra en una base normal y pasa a
    // usada.
    const [matchup] = await getDb()
      .select({ id: competitionMatchup.id, teamAId: competitionMatchup.teamAId })
      .from(competitionMatchup)
      .innerJoin(competitionBase, eq(competitionBase.id, competitionMatchup.baseId))
      .where(
        and(eq(competitionMatchup.rotationId, idOf("J1-R2")), eq(competitionBase.kind, "NORMAL")),
      )
      .limit(1);
    if (!matchup) throw new Error("sin enfrentamiento en la segunda rotación del jueves");
    const declared = await declarePowerAs(actor, id, {
      matchupId: matchup.id,
      teamId: matchup.teamAId,
      power: "DOUBLE_POINTS",
    });
    expect(declared.changed).toBe(true);
    expect((await state()).dayOneCards).toEqual({ EXPIRED: DAY_ONE_CARDS - 1, USED: 1 });

    expect(await advanceRotationAs(actor, id)).toEqual({ rotationId: null });
    const afterAdvance = await state();
    expect(afterAdvance.rotations["J1-R2"]).toBe("CLOSED");
    expect(afterAdvance.rotations["J1-R3"]).toBe("PENDING");
    await startRotationAs(actor, id, idOf("J1-R3"));
    expect((await state()).operator).toEqual({ current: "J1-R3", next: null });
  });
});
