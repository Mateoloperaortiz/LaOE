import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  getCompetition,
  getLiveRotations,
  listBases,
  listCaptains,
  listExtras,
  listMarkets,
  listPowerBoard,
  listRotations,
  listStaff,
  listTeams,
} from "@/modules/competition";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { eventEdition } from "@/modules/events/schema";
import { permission } from "@/modules/identity/schema";
import { person } from "@/modules/people/schema";
import { seedTheGames, THE_GAMES_REHEARSAL_SLUG } from "../../scripts/lib/seed-the-games";
import { prepareTheGamesRehearsal, RehearsalError } from "../../scripts/lib/the-games-ensayo";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// El ensayo sintético de The Games que siembra `npm run db:seed` (desarrollo y staging).

async function seedPrueba(): Promise<void> {
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
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "prueba",
      name: "Edición de prueba",
      description: "",
      startsAt: new Date("2026-10-01T18:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  await seedMember("oe.demo.admin@eafit.edu.co");
  for (const index of ["01", "02", "03"]) await seedMember(`oe.demo.${index}@eafit.edu.co`);
}

describe("ensayo sintético de The Games", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("deja una competencia de ensayo en vivo, completa e idempotente", async () => {
    await seedPrueba();
    const id = await seedTheGames(getDb(), { rotationsPerDay: 2 });
    if (!id) throw new Error("no se sembró");
    const competition = await getCompetition(id);
    expect(competition).toMatchObject({
      slug: THE_GAMES_REHEARSAL_SLUG,
      status: "LIVE",
      isRehearsal: true,
      bettingEnabled: true,
      startingCredits: 1000,
      showCaptains: true,
    });
    const teams = await listTeams(id);
    expect(teams).toHaveLength(30);
    const captains = await listCaptains(id);
    expect(captains).toHaveLength(60);
    expect(captains[0]).toMatchObject({ name: "Ana de ensayo 1", phone: "3000000101" });
    expect(teams.every((team) => team.hasCode)).toBe(true);
    const bases = await listBases(id);
    expect(bases).toHaveLength(30);
    expect(bases.filter((base) => base.kind === "MACRO")).toHaveLength(4);
    expect(await listRotations(id)).toHaveLength(4);
    expect((await getLiveRotations(id)).next?.matchups).toHaveLength(15);
    const staff = await listStaff(id);
    expect(staff.map((row) => row.role).sort()).toEqual(["JUDGE", "JUDGE", "OPERATOR"]);
    const [extra] = await listExtras(id);
    expect(extra?.rubric?.criteria).toHaveLength(5);
    const [market] = await listMarkets(id);
    expect(market?.status).toBe("OPEN");
    // El reparto de poderes: 150 tarjetas, 75 del jueves, entregadas (ADR-098).
    expect((await listPowerBoard(id)).totals).toEqual({
      grants: 150,
      delivered: 75,
      completeTeams: 30,
      teams: 30,
    });
    expect(await seedTheGames(getDb(), { rotationsPerDay: 2 })).toBe(id);
    expect(await listTeams(id)).toHaveLength(30);
  });

  it("sin la edición «prueba» o sin el ADMIN demo no siembra nada", async () => {
    expect(await seedTheGames(getDb())).toBeNull();
    const [admin] = await getDb()
      .select()
      .from(person)
      .where(eq(person.email, "oe.demo.admin@eafit.edu.co"));
    expect(admin).toBeUndefined();
  });

  it("en producción: crea la edición 2026 en borrador y el ensayo, con el ADMIN como juez", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) =>
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
    const adminId = await seedMember("admin.real@eafit.edu.co");
    await getDb().insert(permission).values({ personId: adminId, code: "ADMIN" });
    const plainId = await seedMember("sin.permiso@eafit.edu.co");
    void plainId;
    await expect(
      prepareTheGamesRehearsal({ adminEmail: "sin.permiso@eafit.edu.co", slug: "ensayo-2026" }),
    ).rejects.toThrow(RehearsalError);

    const first = await prepareTheGamesRehearsal({
      adminEmail: "Admin.Real@eafit.edu.co",
      slug: "ensayo-2026",
      rotationsPerDay: 1,
    });
    expect(first).toMatchObject({ editionCreated: true, created: true });
    expect(first.codes).toHaveLength(30);
    const [edition] = await getDb().select().from(eventEdition);
    expect(edition).toMatchObject({
      slug: "2026",
      publicationStatus: "DRAFT",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      endsAt: new Date("2026-10-03T01:00:00Z"),
    });
    expect(await getCompetition(first.competitionId)).toMatchObject({
      status: "LIVE",
      isRehearsal: true,
      showCaptains: false,
    });
    // El ensayo de producción no lleva personas inventadas: tampoco capitanes.
    expect(await listCaptains(first.competitionId)).toEqual([]);
    const staff = await listStaff(first.competitionId);
    expect(staff).toEqual([expect.objectContaining({ personId: adminId, role: "JUDGE" })]);

    const again = await prepareTheGamesRehearsal({
      adminEmail: "admin.real@eafit.edu.co",
      slug: "ensayo-2026",
    });
    expect(again).toEqual({
      competitionId: first.competitionId,
      editionCreated: false,
      created: false,
      codes: [],
    });
  });
});
