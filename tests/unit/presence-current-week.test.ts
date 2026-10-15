import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenceStreak } from "@/modules/participation/components/PresenceStreak";
import { presenceStreakFromFacts } from "@/modules/participation/domain/presence-streak-pure";

type Facts = Parameters<typeof presenceStreakFromFacts>[0];
const sample = (): Facts => ({
  term: { id: "term", startsOn: "2026-10-12", endsOn: "2026-12-31" },
  member: {
    firstTermId: "previous-term",
    joinedAt: new Date("2026-10-01T05:00:00Z"),
    status: "ACTIVE",
    changes: [],
    committees: [],
  },
  occasions: [
    {
      startsAt: new Date("2026-10-15T15:00:00Z"),
      openedAt: new Date("2026-10-13T16:45:00Z"),
      status: "OPEN",
      committeeId: null,
      newMembersOnly: false,
      checkInStatus: null,
    },
  ],
  launchedAt: new Date("2026-10-15T10:20:10Z"),
  now: new Date("2026-10-15T12:19:12Z"),
});

describe("oferta presencial de la semana en curso", () => {
  it("no afirma que faltaba oferta cuando protege una actividad publicada después del lunes", () => {
    // Caso sintético mínimo de una actividad de público general de la semana del reporte.
    // No contiene identidad ni historia de asistencia de una persona real.
    const result = presenceStreakFromFacts(sample());
    // La publicación tardía protege frente a una falta; no demuestra que falten actividades.
    expect(result.weekStatus).toBe("PAUSED");
    const html = renderToStaticMarkup(createElement(PresenceStreak, { streak: result }));
    expect(html).not.toContain("no tenías actividades disponibles");
  });

  it("distingue oferta tardía de falta de actividad registrada", () => {
    expect(presenceStreakFromFacts(sample()).weekPauseReasons).toEqual(["LATE_PUBLICATION"]);
    expect(presenceStreakFromFacts({ ...sample(), occasions: [] }).weekPauseReasons).toEqual([
      "NO_RECORDED_ACTIVITIES",
    ]);
  });

  it("no asistir a una actividad publicada tarde conserva la protección al terminar la semana", () => {
    const result = presenceStreakFromFacts({
      ...sample(),
      now: new Date("2026-10-19T12:19:12Z"),
    });
    expect(result.weeks[0]).toMatchObject({
      status: "PAUSED",
      streak: 0,
      bonus: 0,
      pauseReasons: ["LATE_PUBLICATION"],
    });
  });

  it("asistir a esa misma actividad cumple la semana sin perder la protección de las demás", () => {
    const facts = sample();
    const result = presenceStreakFromFacts({
      ...facts,
      occasions: facts.occasions.map((row) => ({ ...row, checkInStatus: "APPROVED" })),
      now: new Date("2026-10-15T17:19:12Z"),
    });
    expect(result).toMatchObject({ currentStreak: 1, weekStatus: "COMPLETED", bonus: 0 });
    expect(result.weekPauseReasons).toEqual([]);
  });

  it("conserva la falta al terminar una semana con oportunidad publicada a tiempo", () => {
    const facts = sample();
    const result = presenceStreakFromFacts({
      ...facts,
      occasions: facts.occasions.map((row) => ({
        ...row,
        openedAt: new Date("2026-10-11T16:45:00Z"),
      })),
      now: new Date("2026-10-19T12:19:12Z"),
    });
    expect(result.weeks[0]).toMatchObject({ status: "MISSED", streak: 0, bonus: 0 });
  });

  it("identifica la licencia sin adjudicarle ausencia de actividades", () => {
    const facts = sample();
    expect(
      presenceStreakFromFacts({
        ...facts,
        member: facts.member ? { ...facts.member, status: "ON_LEAVE" } : null,
      }).weekPauseReasons,
    ).toEqual(["ON_LEAVE"]);
  });

  it("identifica la excusa y permite más de un motivo cuando quedan actividades tardías", () => {
    const facts = sample();
    const excused = facts.occasions.map((row) => ({ ...row, checkInStatus: "EXCUSED" as const }));
    expect(presenceStreakFromFacts({ ...facts, occasions: excused }).weekPauseReasons).toEqual([
      "EXCUSED",
    ]);
    expect(
      presenceStreakFromFacts({ ...facts, occasions: [...excused, ...facts.occasions] })
        .weekPauseReasons,
    ).toEqual(["EXCUSED", "LATE_PUBLICATION"]);
  });

  it("no convierte una fecha de publicación desconocida en ausencia de oferta", () => {
    const facts = sample();
    expect(
      presenceStreakFromFacts({
        ...facts,
        occasions: facts.occasions.map((row) => ({ ...row, openedAt: null })),
      }).weekPauseReasons,
    ).toEqual(["INSUFFICIENT_HISTORY"]);
  });

  it("no inventa un motivo cuando falta la historia de la persona", () => {
    expect(presenceStreakFromFacts({ ...sample(), member: null }).weekPauseReasons).toEqual([
      "INSUFFICIENT_HISTORY",
    ]);
  });
});
