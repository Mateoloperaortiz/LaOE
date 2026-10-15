import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  GamerLeaderboard,
  GamerSeason,
  GamerStreak,
} from "@/modules/participation/components/GamerSeason";
import type { GamerProfile, GamerStanding } from "@/modules/participation/gamer-types";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";

vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));

const profile = (overrides: Partial<GamerProfile> = {}): GamerProfile => ({
  launched: true,
  points: 18,
  rankingMetric: "POINTS",
  participations: 3,
  activeDays: 3,
  rank: 1,
  totalPlayers: 1,
  currentStreak: 3,
  longestStreak: 3,
  todayGames: ["WORDLE"],
  weekWildcardUsed: false,
  milestones: [
    { days: 3, reachedOn: "2026-10-15" },
    { days: 7, reachedOn: null },
    { days: 30, reachedOn: null },
  ],
  nextMilestone: 7,
  ...overrides,
});

function renderSeason(mine: GamerProfile, closed = false) {
  const standing: GamerStanding = {
    personId: "persona-sintetica",
    name: "Persona sintética",
    anonymized: false,
    points: mine.points,
    participations: mine.participations,
    activeDays: mine.activeDays,
    rank: mine.rank ?? 1,
  };
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement(GamerSeason, { profile: mine, termCode: "2026-2", closed }),
      createElement(GamerLeaderboard, {
        leaderboard: mine.rankingMetric === null ? [] : [standing],
        personId: standing.personId,
        rankingMetric: mine.rankingMetric,
      }),
      createElement(GamerStreak, { profile: mine, closed }),
    ),
  );
}

describe("unidad de la clasificación gamer", () => {
  const pointsLabel = copyPattern("T-3477").source;
  const participationsLabel = copyPattern("T-3403").source;

  it("presenta puntos como resultado principal y participaciones como desempate separado", () => {
    const html = renderSeason(profile());
    expect(html).toMatch(new RegExp(`<dt[^>]*>${pointsLabel}</dt><dd[^>]*>18</dd>`));
    expect(html).toMatch(new RegExp(`<th scope="col"[^>]*>${pointsLabel}</th>`));
    expect(html).toMatch(/<td[^>]*>18<\/td><td[^>]*>3<\/td><td[^>]*>3<\/td>/);
    expect(html).toContain(t("T-3426"));
    expect(html).toContain(t("T-3413", { n: 3 }));
    expect(html).toContain(t("T-3421", { n: 3 }));
  });

  it("conserva una foto por participaciones sin convertir tres participaciones en puntos", () => {
    const html = renderSeason(profile({ rankingMetric: "PARTICIPATIONS", points: null }), true);
    expect(html).toMatch(new RegExp(`<dt[^>]*>${participationsLabel}</dt><dd[^>]*>3</dd>`));
    expect(html).toContain(t("T-3480"));
    expect(html).toContain(t("T-3481"));
    expect(html).not.toMatch(new RegExp(`<th scope="col"[^>]*>${pointsLabel}</th>`));
    expect(html).not.toMatch(new RegExp(`<dt[^>]*>${pointsLabel}</dt>`));
    expect(html).not.toContain(t("T-3426"));
  });

  it("declara la clasificación ausente en cierres anteriores sin fabricar ceros ni lanzamiento pendiente", () => {
    const html = renderSeason(
      profile({ rankingMetric: null, points: null, rank: null, launched: false }),
      true,
    );
    expect(html).toContain(t("T-3483"));
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<dl");
    expect(html).not.toContain(t("T-3461"));
    expect(html).not.toContain(t("T-3480"));
  });

  it("distingue cero puntos de un resultado histórico no disponible", () => {
    const html = renderSeason(profile({ points: 0, participations: 0, activeDays: 0, rank: null }));
    expect(html).toMatch(new RegExp(`<dt[^>]*>${pointsLabel}</dt><dd[^>]*>0</dd>`));
    expect(html).not.toContain(t("T-3483"));
    expect(html).not.toContain(t("T-3480"));
  });
});
