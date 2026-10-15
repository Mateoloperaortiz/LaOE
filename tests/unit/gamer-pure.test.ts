import { describe, expect, it } from "vitest";
import {
  gamerStreak,
  rankGamer,
  uniqueGamerParticipations,
} from "@/modules/participation/domain/gamer-pure";
import {
  GAMER_GAMES,
  type GamerCredit,
  type GamerParticipation,
} from "@/modules/participation/gamer-types";
import { addDays } from "@/shared/lib/dates-pure";

const season = (days: string[], today: string) =>
  gamerStreak(days, "2026-09-01", "2026-12-31", today);

describe("clasificación gamer", () => {
  it("cuenta los cuatro juegos una vez por día aunque Panal entregue varios avances", () => {
    const rows: GamerParticipation[] = GAMER_GAMES.map((game) => ({
      personId: "a",
      day: "2026-09-07",
      game,
    }));
    expect(
      uniqueGamerParticipations([...rows, { personId: "a", day: "2026-09-07", game: "PANAL" }]),
    ).toHaveLength(4);
    expect(
      rankGamer(
        [{ personId: "a", name: "Ana", anonymized: false }],
        [...rows, ...rows].map((row) => ({ ...row, points: 1 })),
      )[0],
    ).toMatchObject({ points: 8, participations: 4, activeDays: 1 });
  });

  it("desempata por días activos y después comparte puesto sin usar la racha ni el nombre", () => {
    const members = ["a", "b", "c", "d"].map((personId) => ({
      personId,
      name: personId,
      anonymized: false,
    }));
    const rows: GamerParticipation[] = [
      { personId: "a", day: "2026-09-07", game: "WORDLE" },
      { personId: "a", day: "2026-09-07", game: "PANAL" },
      { personId: "b", day: "2026-09-07", game: "WORDLE" },
      { personId: "b", day: "2026-09-08", game: "WORDLE" },
      { personId: "c", day: "2026-09-07", game: "PANAL" },
      { personId: "c", day: "2026-09-09", game: "PANAL" },
      { personId: "d", day: "2026-09-07", game: "SUDOKU" },
      { personId: "excluded", day: "2026-09-07", game: "WORDLE" },
    ];
    expect(
      rankGamer(
        members,
        rows.map((row) => ({ ...row, points: 1 })),
      ).map((row) => [row.personId, row.rank]),
    ).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });

  it("suma 1+2+3 del Panal sin convertir sus avances en tres participaciones", () => {
    const rows: GamerCredit[] = [1, 2, 3].map((points) => ({
      personId: "a",
      game: "PANAL",
      day: "2026-09-25",
      points,
    }));
    expect(
      rankGamer([{ personId: "a", name: "Persona sintética", anonymized: false }], rows),
    ).toMatchObject([{ points: 6, participations: 1, activeDays: 1 }]);
  });

  it("conserva los importes positivos sin inventar un techo para la historia legada", () => {
    const rows: GamerCredit[] = [1, 6].map((points) => ({
      personId: "a",
      game: "WORDLE",
      day: "2026-09-25",
      points,
    }));
    expect(
      rankGamer([{ personId: "a", name: "Persona sintética", anonymized: false }], rows),
    ).toMatchObject([{ points: 7, participations: 1, activeDays: 1 }]);
  });

  it("ordena puntos, participaciones y días, y comparte puesto al coincidir las tres cifras", () => {
    const members = ["a", "b", "c", "d", "e"].map((personId) => ({
      personId,
      name: personId,
      anonymized: false,
    }));
    const rows: GamerCredit[] = [
      { personId: "a", day: "2026-09-07", game: "WORDLE", points: 6 },
      { personId: "b", day: "2026-09-07", game: "WORDLE", points: 1 },
      { personId: "b", day: "2026-09-08", game: "WORDLE", points: 1 },
      { personId: "c", day: "2026-09-07", game: "WORDLE", points: 3 },
      { personId: "c", day: "2026-09-08", game: "WORDLE", points: 3 },
      { personId: "d", day: "2026-09-07", game: "WORDLE", points: 4 },
      { personId: "d", day: "2026-09-07", game: "PANAL", points: 2 },
      { personId: "e", day: "2026-09-07", game: "WORDLE", points: 4 },
      { personId: "e", day: "2026-09-07", game: "SUDOKU", points: 2 },
    ];
    expect(rankGamer(members, rows).map((row) => [row.personId, row.rank])).toEqual([
      ["c", 1],
      ["d", 2],
      ["e", 2],
      ["a", 4],
      ["b", 5],
    ]);
  });
});

describe("racha gamer del semestre", () => {
  it("una participación mantiene el día y varias no inflan la racha", () => {
    expect(season(["2026-09-07", "2026-09-07", "2026-09-08"], "2026-09-08")).toMatchObject({
      currentStreak: 2,
      longestStreak: 2,
      weekWildcardUsed: false,
    });
  });

  it("hoy queda pendiente sin gastar el comodín antes de la medianoche", () => {
    expect(season(["2026-09-07"], "2026-09-08")).toMatchObject({
      currentStreak: 1,
      weekWildcardUsed: false,
    });
  });

  it("el comodín automático conserva la racha sin sumar día ni adelantar una insignia", () => {
    const streak = season(["2026-09-07", "2026-09-09"], "2026-09-09");
    expect(streak).toMatchObject({
      currentStreak: 2,
      longestStreak: 2,
      weekWildcardUsed: true,
      nextMilestone: 3,
    });
    expect(streak.milestones[0]?.reachedOn).toBeNull();
  });

  it("una segunda falta en la misma semana reinicia y conserva el récord histórico", () => {
    expect(
      season(["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-12"], "2026-09-12"),
    ).toMatchObject({ currentStreak: 1, longestStreak: 3, weekWildcardUsed: true });
  });

  it("renueva el comodín el lunes y conserva una racha que atraviesa dos semanas", () => {
    expect(season(["2026-09-11", "2026-09-12", "2026-09-15"], "2026-09-15")).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      weekWildcardUsed: true,
    });
  });

  it("reconoce los hitos históricos de 3, 7 y 30 días y conserva las fechas", () => {
    const days = Array.from({ length: 30 }, (_, index) => addDays("2026-09-01", index));
    expect(season(days, "2026-09-30").milestones).toEqual([
      { days: 3, reachedOn: "2026-09-03" },
      { days: 7, reachedOn: "2026-09-07" },
      { days: 30, reachedOn: "2026-09-30" },
    ]);
    expect(season(days, "2026-10-05")).toMatchObject({
      currentStreak: 0,
      longestStreak: 30,
      nextMilestone: null,
    });
  });

  it("no arrastra participaciones, racha ni comodín del semestre anterior", () => {
    expect(
      gamerStreak(
        ["2026-06-29", "2026-06-30", "2026-07-01"],
        "2026-07-01",
        "2026-12-31",
        "2026-07-01",
      ),
    ).toMatchObject({ currentStreak: 1, longestStreak: 1, weekWildcardUsed: false });
  });
});
