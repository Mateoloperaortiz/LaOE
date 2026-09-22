import { describe, expect, it } from "vitest";
import {
  type ReminderOccasion,
  reminderSlots,
} from "@/modules/participation/domain/reminders-pure";
import { isoWeek, noticePush } from "@/modules/permanence/domain/notices-push-pure";
import { t } from "@/shared/copy";
import { hourIn } from "@/shared/lib/dates";

// Recordatorios (ADR-038 regla 9) con relojes fijos de Bogotá (UTC-5) y avisos de permanencia (regla 10).

const TZ = "America/Bogota";
const HOURS = { today: 7, eve: 18 };

function occasion(
  id: string,
  startsAt: string,
  overrides: Partial<ReminderOccasion> = {},
): ReminderOccasion {
  return {
    id,
    kind: "ACTIVITY",
    category: "INTEGRATION",
    status: "OPEN",
    startsAt: new Date(startsAt),
    ...overrides,
  };
}

describe("reminderSlots", () => {
  // Jueves 2026-09-10 a las 07:00 de Bogotá.
  const sevenAm = new Date("2026-09-10T12:00:00Z");
  // El mismo día a las 18:00 de Bogotá.
  const sixPm = new Date("2026-09-10T23:00:00Z");

  it("a las 07:00 avisa las actividades de hoy que aún no empezaron, no las reuniones ni las asambleas", () => {
    expect(hourIn(TZ, sevenAm)).toBe(7);
    const due = reminderSlots(
      [
        occasion("hoy", "2026-09-10T23:00:00Z"), // 18:00 de hoy
        occasion("tarde", "2026-09-11T03:30:00Z"), // 22:30 de hoy en Bogotá (día siguiente en UTC)
        occasion("pasada", "2026-09-10T11:00:00Z"), // 06:00 de hoy, ya empezó
        occasion("manana", "2026-09-11T23:00:00Z"),
        occasion("reunion", "2026-09-10T22:00:00Z", { category: "COMMITTEE_MEETING" }),
        occasion("asamblea", "2026-09-10T22:00:00Z", { kind: "ASSEMBLY", category: "OTHER" }),
        occasion("borrador", "2026-09-10T22:00:00Z", { status: "DRAFT" }),
      ],
      sevenAm,
      HOURS,
      TZ,
    );
    expect(due).toEqual([
      { slot: "TODAY", occasionId: "hoy" },
      { slot: "TODAY", occasionId: "tarde" },
    ]);
  });

  it("a las 18:00 avisa las reuniones de comité y las asambleas de mañana", () => {
    const due = reminderSlots(
      [
        occasion("reunion", "2026-09-11T22:00:00Z", { category: "COMMITTEE_MEETING" }),
        occasion("asamblea", "2026-09-12T00:00:00Z", { kind: "ASSEMBLY", category: "OTHER" }), // 19:00 de mañana
        occasion("integracion", "2026-09-11T22:00:00Z"),
        occasion("pasado", "2026-09-12T22:00:00Z", { category: "COMMITTEE_MEETING" }),
      ],
      sixPm,
      HOURS,
      TZ,
    );
    expect(due).toEqual([
      { slot: "MEETING_EVE", occasionId: "reunion" },
      { slot: "ASSEMBLY_EVE", occasionId: "asamblea" },
    ]);
  });

  it("a cualquier hora avisa la asamblea que empieza entre 2 y 3 horas después", () => {
    const now = new Date("2026-09-10T20:00:00Z");
    const due = reminderSlots(
      [
        occasion("en-dos-y-media", "2026-09-10T22:30:00Z", { kind: "ASSEMBLY", category: "OTHER" }),
        occasion("en-una", "2026-09-10T21:00:00Z", { kind: "ASSEMBLY", category: "OTHER" }),
        occasion("en-cuatro", "2026-09-11T00:00:00Z", { kind: "ASSEMBLY", category: "OTHER" }),
        occasion("actividad", "2026-09-10T22:30:00Z"),
      ],
      now,
      HOURS,
      TZ,
    );
    expect(due).toEqual([{ slot: "ASSEMBLY_SOON", occasionId: "en-dos-y-media" }]);
  });
});

describe("noticePush", () => {
  const context = {
    termId: "t1",
    personId: "p1",
    committeeName: "Pixel",
    now: new Date("2026-09-10T12:00:00Z"),
  };

  it("traduce cada aviso a su texto, URL y clave; la asamblea obligatoria no va por push", () => {
    const mid = noticePush(
      { kind: "MID_TERM", committeeId: "c1", values: { n: 45, umbral: 60, m: 30, comité: "c1" } },
      context,
    );
    expect(mid).toEqual({
      text: t("T-184", { n: 45, umbral: 60, comité: "Pixel" }),
      url: "/app/permanencia",
      dedupeKey: "notice:t1:p1:MID_TERM:c1",
    });
    expect(
      noticePush(
        {
          kind: "NO_ALCANZA",
          committeeId: "c1",
          values: { n: 10, umbral: 60, m: 5, comité: "c1" },
        },
        context,
      )?.text,
    ).toBe(t("T-186", { comité: "Pixel" }));
    expect(noticePush({ kind: "TERM_CLOSED", values: { término: "2026-2" } }, context)).toEqual({
      text: t("T-187", { término: "2026-2" }),
      url: "/app/permanencia",
      dedupeKey: "notice:t1:p1:TERM_CLOSED",
    });
    const evaluations = noticePush(
      { kind: "EVALUATIONS_PENDING", values: { n: 3, fecha: "2026-12-05", término: "2026-2" } },
      context,
    );
    expect(evaluations?.url).toBe("/admin/permanencia/evaluaciones");
    expect(evaluations?.dedupeKey).toBe("notice:t1:p1:EVALUATIONS:2026-W37");
    expect(evaluations?.text).toContain(t("T-188", { n: 3, fecha: "2026-12-05" }));
    expect(
      noticePush(
        {
          kind: "MANDATORY_ASSEMBLY",
          occasionId: "o1",
          values: { asamblea: "x", fecha: "", lugar: "" },
        },
        context,
      ),
    ).toBeNull();
    expect(
      noticePush({ kind: "EVALUATION_WINDOW_CLOSED", values: { fecha: "" } }, context),
    ).toBeNull();
  });

  it("calcula la semana ISO", () => {
    expect(isoWeek(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2026-09-10T12:00:00Z"))).toBe("2026-W37");
    expect(isoWeek(new Date("2027-01-03T12:00:00Z"))).toBe("2026-W53");
  });
});
