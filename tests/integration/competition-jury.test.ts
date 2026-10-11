import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  assignStaffAs,
  type CompetitionActor,
  createCompetitionAs,
  createExtraAs,
  createTeamAs,
  importJuryScoresAs,
  listExtras,
  listStandings,
  removeJuryScoresAs,
} from "@/modules/competition";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { t } from "@/shared/copy";
import { seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Los jurados de The Challenge (ADR-103): cada jurado por aparte, el orden con el promedio y, sobre
// todo, que las notas no toquen el libro.

const admin = (personId: string): CompetitionActor => ({ personId, isAdmin: true, ip: null });
const member = (personId: string): CompetitionActor => ({ personId, isAdmin: false, ip: null });

async function seedChallenge(slug = "the-games-2026") {
  await seedTerm();
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: `dias-${slug}`,
      name: "Días EAFIT",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edition = await runCommand(SYSTEM_ACTOR, (ctx) =>
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
  const adminId = await seedMember(`admin-${slug}@example.com`);
  const { id } = await createCompetitionAs(admin(adminId), {
    editionId: edition.id,
    slug,
    name: "The Games 2026",
  });
  for (let n = 1; n <= 4; n++) {
    await createTeamAs(admin(adminId), id, { number: n, name: `Equipo de prueba ${n}` });
  }
  const challenge = await createExtraAs(admin(adminId), id, { name: "The Challenge", day: 1 });
  return { id, adminId, extraId: challenge.id };
}

const JUDGE_A = [
  "#\tEquipo\tTalento\tImpacto\tIntegración\tEstructura\tProducción\tNormas\tTotal\tNivel",
  "1\tEquipo de prueba 1\tBaile\t10\t10\t10\t10\t10\t100\tExcelente",
  "2\tEquipo de prueba 2\tTeatro\t8\t8\t8\t8\t8\t80\tBueno",
  "3\tEquipo de prueba 3\tCanto\t6\t6\t6\t6\t6\t60\tRegular",
  "4\t\t\t\t\t\t\t\t\t",
].join("\n");
const JUDGE_B = "1\t\t\t6\t6\t6\t6\t6\n2\t\t\t10\t10\t10\t10\t10";

async function jury(id: string) {
  const [extra] = await listExtras(id);
  return extra?.jury ?? null;
}

describe("jurados de The Challenge", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(() => closeDb());

  it("promedia a los jurados, reemplaza solo al que se vuelve a cargar y no toca el libro", async () => {
    const { id, adminId, extraId } = await seedChallenge();
    expect(
      await importJuryScoresAs(admin(adminId), id, { extraId, judge: "Jurado A", text: JUDGE_A }),
    ).toMatchObject({ saved: true, teams: 3 });
    await importJuryScoresAs(admin(adminId), id, { extraId, judge: "Jurado B", text: JUDGE_B });

    let current = await jury(id);
    expect(current?.judges).toEqual([
      { name: "Jurado A", teams: 3 },
      { name: "Jurado B", teams: 2 },
    ]);
    // Equipo 1: (10 + 6) / 2 = 8; equipo 2: (8 + 10) / 2 = 9; equipo 3: 6; equipo 4 sin notas.
    expect(current?.ranking.map((row) => [row.total, row.rank, row.judges])).toEqual([
      [90, 1, 2],
      [80, 2, 2],
      [60, 3, 1],
      [null, null, 0],
    ]);

    // El jurado A corrige: solo cambian sus notas, aunque escriba su nombre distinto.
    await importJuryScoresAs(admin(adminId), id, {
      extraId,
      judge: "jurado a",
      text: "3\t\t\t10\t10\t10\t10\t10",
    });
    current = await jury(id);
    expect(current?.judges.map((judge) => judge.teams).sort()).toEqual([1, 2]);
    expect(current?.ranking[0]).toMatchObject({ total: 100, judges: 1 });

    // Las notas no dan puntos: la tabla sigue en cero.
    const standings = await listStandings(id);
    expect(standings.overall.every((row) => row.points === 0)).toBe(true);

    await removeJuryScoresAs(admin(adminId), id, { extraId, judge: "Jurado B" });
    expect((await jury(id))?.judges).toEqual([{ name: "jurado a", teams: 1 }]);
    await expect(
      removeJuryScoresAs(admin(adminId), id, { extraId, judge: "Jurado B" }),
    ).rejects.toThrow(t("T-2764"));
  });

  it("con un error no guarda nada y dice la línea", async () => {
    const { id, adminId, extraId } = await seedChallenge();
    const result = await importJuryScoresAs(admin(adminId), id, {
      extraId,
      judge: "Jurado A",
      text: "1\t\t\t10\t10\t10\n2\t\t\t10\t11\t10\t10\t10",
    });
    expect(result.saved).toBe(false);
    expect(result.errors).toEqual([
      t("T-3169", { linea: 1 }),
      t("T-3170", { linea: 2, nota: "11" }),
    ]);
    expect(await jury(id)).toBeNull();
    await expect(
      importJuryScoresAs(admin(adminId), id, { extraId, judge: "  ", text: JUDGE_A }),
    ).rejects.toThrow(t("T-3173"));
  });

  it("solo los operadores cargan, y solo en una extra de puntos directos de la competencia", async () => {
    const { id, adminId, extraId } = await seedChallenge();
    const operatorId = await seedMember("operador-jurados@example.com");
    await assignStaffAs(admin(adminId), id, { personId: operatorId, role: "OPERATOR" });
    expect(
      await importJuryScoresAs(member(operatorId), id, {
        extraId,
        judge: "Jurado A",
        text: JUDGE_A,
      }),
    ).toMatchObject({ saved: true });
    const outsiderId = await seedMember("sin-rol-jurados@example.com");
    await expect(
      importJuryScoresAs(member(outsiderId), id, { extraId, judge: "Jurado B", text: JUDGE_B }),
    ).rejects.toThrow(t("T-2764"));

    const rubric = await createExtraAs(admin(adminId), id, {
      name: "Rúbrica de siempre",
      day: 1,
      kind: "THE_CHALLENGE_RUBRIC",
    });
    await expect(
      importJuryScoresAs(admin(adminId), id, {
        extraId: rubric.id,
        judge: "Jurado A",
        text: JUDGE_A,
      }),
    ).rejects.toThrow(t("T-2764"));

    const other = await seedChallenge("otra-competencia");
    await expect(
      importJuryScoresAs(admin(adminId), id, {
        extraId: other.extraId,
        judge: "Jurado A",
        text: JUDGE_A,
      }),
    ).rejects.toThrow(t("T-2764"));
  });
});
