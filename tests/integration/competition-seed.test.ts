import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  getCompetition,
  getLiveRotations,
  listBases,
  listExtras,
  listMarkets,
  listRotations,
  listStaff,
  listTeams,
} from "@/modules/competition";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { person } from "@/modules/people/schema";
import { seedTheGames, THE_GAMES_REHEARSAL_SLUG } from "../../scripts/lib/seed-the-games";
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
    });
    const teams = await listTeams(id);
    expect(teams).toHaveLength(30);
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
});
