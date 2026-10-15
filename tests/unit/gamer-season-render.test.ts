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
        leaderboard: mine.rankingMetric === null || mine.rank === null ? [] : [standing],
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
    expect(html).toContain(t("T-3554", { n: 3 }));
    expect(html).not.toContain(t("T-3479", { n: 0 }));
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
    expect(html).not.toContain(t("T-3549"));
  });

  it("distingue cero puntos de un resultado histórico no disponible", () => {
    const html = renderSeason(profile({ points: 0, participations: 0, activeDays: 0, rank: null }));
    expect(html).toMatch(new RegExp(`<dt[^>]*>${pointsLabel}</dt><dd[^>]*>0</dd>`));
    expect(html).not.toContain(t("T-3483"));
    expect(html).not.toContain(t("T-3480"));
  });
});

const standing = (personId: string, rank: number): GamerStanding => ({
  personId,
  name: `Persona sintética ${personId}`,
  anonymized: false,
  points: 18,
  participations: 3,
  activeDays: 3,
  rank,
});

function renderPodium(rows: GamerStanding[]) {
  const html = renderToStaticMarkup(
    createElement(GamerLeaderboard, {
      leaderboard: rows,
      personId: "a",
      rankingMetric: "POINTS",
    }),
  );
  return (
    html.match(/<section aria-labelledby="gamer-podium-title"[^>]*>([\s\S]*?)<\/section>/)?.[1] ??
    ""
  );
}

describe("podio por puestos reales", () => {
  it("conserva ambos primeros y el tercero sin fabricar un segundo ni escoger representante", () => {
    const html = renderPodium([standing("a", 1), standing("b", 1), standing("c", 3)]);
    expect(html).toContain(t("T-3549"));
    expect(html).toContain(`aria-label="${t("T-3407", { n: 1 })}"`);
    expect(html).toContain(`aria-label="${t("T-3407", { n: 3 })}"`);
    expect(html).not.toContain(t("T-3407", { n: 2 }));
    for (const id of ["a", "b", "c"]) expect(html).toContain(standing(id, 1).name);
    expect(html).toContain(t("T-3550"));
    expect(html).toContain(t("T-3552"));
    expect(html).not.toContain(t("T-3551"));
  });

  it.each([
    { ranks: [], groups: [] },
    { ranks: [1], groups: [1] },
    { ranks: [1, 2], groups: [1, 2] },
    { ranks: [1, 1], groups: [1] },
    { ranks: [1, 2, 3], groups: [1, 2, 3] },
    { ranks: [1, 2, 2, 4], groups: [1, 2] },
  ])("muestra sólo los grupos existentes para $ranks", ({ ranks, groups }) => {
    const rows = ranks.map((rank, index) => standing(`sintetica-${index}`, rank));
    const html = renderPodium(rows);
    for (const rank of [1, 2, 3]) {
      const group = `aria-label="${t("T-3407", { n: rank })}"`;
      expect(html.includes(group)).toBe(groups.includes(rank));
    }
    for (const row of rows) expect(html.includes(row.name)).toBe(row.rank <= 3);
    if (rows.length === 0) expect(html).toBe("");
  });

  it("conserva diez primeros visibles, declara el alcance y respeta el anonimato", () => {
    const rows = Array.from({ length: 10 }, (_, index) => standing(`sintetica-${index}`, 1));
    const first = rows[0];
    if (!first) throw new Error("Falta la primera persona sintética");
    first.anonymized = true;
    const html = renderPodium(rows);
    expect(html).toContain(t("T-3551"));
    expect(html).toContain(t("T-3550"));
    expect(html).toContain(t("T-223"));
    expect(html).not.toContain(first.name);
    for (const row of rows.slice(1)) expect(html).toContain(row.name);
    expect(html).not.toContain(t("T-3407", { n: 2 }));
    expect(html).not.toContain(t("T-3407", { n: 3 }));
  });
});
