import { describe, expect, it } from "vitest";
import { presenceStreakFromFacts } from "@/modules/participation/domain/presence-streak-pure";

const HOUR = 60 * 60 * 1000;
const ACTIVITY = new Date("2026-11-05T15:00:00Z");
const EFFECTIVE = new Date("2026-11-02T05:00:00Z");

function week(input: {
  noticeMs: number | null;
  effectiveAt?: Date | null;
  startsAt?: Date;
  approved?: boolean;
}) {
  const startsAt = input.startsAt ?? ACTIVITY;
  return presenceStreakFromFacts({
    term: { id: "term", startsOn: "2026-11-02", endsOn: "2026-12-31" },
    member: {
      firstTermId: "previous-term",
      joinedAt: new Date("2026-10-01T05:00:00Z"),
      status: "ACTIVE",
      changes: [],
      committees: [],
    },
    occasions: [
      {
        startsAt,
        openedAt: input.noticeMs === null ? null : new Date(startsAt.getTime() - input.noticeMs),
        status: "CLOSED",
        committeeId: null,
        newMembersOnly: false,
        checkInStatus: input.approved ? "APPROVED" : null,
      },
    ],
    launchedAt: new Date("2026-10-01T05:00:00Z"),
    notice24hEffectiveAt: input.effectiveAt === undefined ? EFFECTIVE : input.effectiveAt,
    now: new Date("2026-11-09T15:00:00Z"),
  }).weeks[0];
}

describe("aviso mínimo de 24 horas con vigencia fija", () => {
  it.each([
    { hours: 19, status: "PAUSED" },
    { hours: 24, status: "MISSED" },
    { hours: 25, status: "MISSED" },
  ])("$hours horas de aviso producen $status después de la vigencia", ({ hours, status }) => {
    const result = week({ noticeMs: hours * HOUR });
    expect(result?.status).toBe(status);
    if (status === "PAUSED") expect(result?.pauseReasons).toEqual(["SHORT_NOTICE"]);
  });

  it("protege cuando falta un milisegundo para alcanzar 24 horas", () => {
    expect(week({ noticeMs: 24 * HOUR - 1 })).toMatchObject({
      status: "PAUSED",
      pauseReasons: ["SHORT_NOTICE"],
    });
  });

  it("no convierte en falta una actividad que empezó antes de activar la regla", () => {
    expect(
      week({ noticeMs: 25 * HOUR, effectiveAt: new Date(ACTIVITY.getTime() + 1) }),
    ).toMatchObject({ status: "PAUSED", pauseReasons: ["LATE_PUBLICATION"] });
  });

  it("aplica la regla desde el primer instante exacto de vigencia", () => {
    expect(week({ noticeMs: 24 * HOUR, effectiveAt: ACTIVITY })?.status).toBe("MISSED");
    expect(
      week({ noticeMs: 24 * HOUR, effectiveAt: new Date(ACTIVITY.getTime() - 1) })?.status,
    ).toBe("MISSED");
  });

  it("conserva la regla anterior mientras la activación siga nula", () => {
    expect(week({ noticeMs: 25 * HOUR, effectiveAt: null })).toMatchObject({
      status: "PAUSED",
      pauseReasons: ["LATE_PUBLICATION"],
    });
  });

  it("la falta de una publicación demostrada conserva la protección", () => {
    expect(week({ noticeMs: null })).toMatchObject({
      status: "PAUSED",
      pauseReasons: ["INSUFFICIENT_HISTORY"],
    });
  });

  it.each([19, 24, 25])("una asistencia válida cumple con %s horas de aviso", (hours) => {
    expect(week({ noticeMs: hours * HOUR, approved: true })).toMatchObject({
      status: "COMPLETED",
      streak: 1,
      bonus: 0,
      pauseReasons: [],
    });
  });
});
