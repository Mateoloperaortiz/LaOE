import { describe, expect, it } from "vitest";
import {
  type LeagueRow,
  leagueWeekOf,
  nextTiers,
  promoted,
} from "@/modules/participation/domain/league-pure";

// Las ligas semanales (ADR-178): subir, bajar y quedarse, la semana de lunes a domingo y el ascenso.

const row = (personId: string, tier: LeagueRow["tier"], points: number): LeagueRow => ({
  personId,
  tier,
  points,
});

describe("nextTiers", () => {
  it("los primeros cinco que sumaron suben y los últimos cinco que sumaron bajan", () => {
    const plata = Array.from({ length: 12 }, (_, index) => row(`p${index}`, "PLATA", 100 - index));
    const next = nextTiers(plata);
    expect(["p0", "p1", "p2", "p3", "p4"].map((id) => next.get(id))).toEqual(Array(5).fill("ORO"));
    expect(["p5", "p6"].map((id) => next.get(id))).toEqual(["PLATA", "PLATA"]);
    expect(["p7", "p8", "p9", "p10", "p11"].map((id) => next.get(id))).toEqual(
      Array(5).fill("BRONCE"),
    );
  });

  it("quien no sumó nada se queda, aunque vaya de último", () => {
    const next = nextTiers([row("a", "ORO", 30), row("b", "ORO", 0), row("c", "ORO", 0)]);
    expect(next.get("a")).toBe("DIAMANTE");
    expect(next.get("b")).toBe("ORO");
    expect(next.get("c")).toBe("ORO");
  });

  it("en Diamante nadie sube y en Bronce nadie baja; con pocos, prefiere subir", () => {
    const next = nextTiers([
      ...Array.from({ length: 3 }, (_, index) => row(`d${index}`, "DIAMANTE", 10 + index)),
      ...Array.from({ length: 3 }, (_, index) => row(`b${index}`, "BRONCE", 10 + index)),
    ]);
    expect(["d0", "d1", "d2"].map((id) => next.get(id))).toEqual(Array(3).fill("ORO"));
    expect(["b0", "b1", "b2"].map((id) => next.get(id))).toEqual(Array(3).fill("PLATA"));
  });
});

describe("la semana y el ascenso", () => {
  it("la semana empieza el lunes, también desde un domingo y al cruzar el año", () => {
    expect(leagueWeekOf("2026-11-13")).toBe("2026-11-09");
    expect(leagueWeekOf("2026-11-15")).toBe("2026-11-09");
    expect(leagueWeekOf("2027-01-01")).toBe("2026-12-28");
  });

  it("solo es ascenso si la liga nueva es más alta que la anterior", () => {
    expect(promoted("BRONCE", "PLATA")).toBe(true);
    expect(promoted("ORO", "ORO")).toBe(false);
    expect(promoted("ORO", "PLATA")).toBe(false);
    expect(promoted(null, "BRONCE")).toBe(false);
  });
});
