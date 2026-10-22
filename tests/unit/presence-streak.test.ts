import { describe, expect, it } from "vitest";
import {
  type PresenceMemberHistory,
  type PresenceOccasionFact,
  presenceBonusFor,
  presenceStreakFromFacts,
} from "@/modules/participation/domain/presence-streak-pure";

const term = { id: "semestre", startsOn: "2026-09-07", endsOn: "2026-12-20" };
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const member: PresenceMemberHistory = {
  firstTermId: term.id,
  joinedAt: at("2026-09-01"),
  status: "ACTIVE",
  changes: [],
  committees: [],
};
const occasion = (
  day: string,
  overrides: Partial<PresenceOccasionFact> = {},
): PresenceOccasionFact => ({
  startsAt: at(day),
  openedAt: at("2026-09-01"),
  status: "CLOSED",
  committeeId: null,
  newMembersOnly: false,
  checkInStatus: "APPROVED",
  ...overrides,
});
const state = (
  occasions: PresenceOccasionFact[],
  now = at("2026-09-28"),
  overrides: Partial<Parameters<typeof presenceStreakFromFacts>[0]> = {},
) =>
  presenceStreakFromFacts({
    term,
    member,
    occasions,
    now,
    launchedAt: at("2026-09-01"),
    ...overrides,
  });

describe("constancia presencial por semana", () => {
  it("una asistencia parcial no completa la semana ni entrega el bono presencial", () => {
    const partial = { ...occasion("2026-09-15"), attendanceExtent: "PARTIAL" as const };
    const result = state([occasion("2026-09-08"), partial, occasion("2026-09-22")]);
    expect(result.weeks.slice(0, 3).map((week) => [week.status, week.streak, week.bonus])).toEqual([
      ["COMPLETED", 1, 0],
      ["MISSED", 0, 0],
      ["COMPLETED", 1, 0],
    ]);
  });

  it("reconoce una sola semana y un solo bono aunque haya varias asistencias", () => {
    const result = state([
      occasion("2026-09-08"),
      occasion("2026-09-15"),
      occasion("2026-09-16"),
      occasion("2026-09-22"),
    ]);
    expect(result.currentStreak).toBe(3);
    expect(result.weeks.map((week) => week.bonus)).toEqual([0, 2, 3, 0]);
    expect(result.weekStatus).toBe("PAUSED");
  });

  it("una semana sin oportunidades pausa sin aumentar semanas ni bono", () => {
    const result = state(
      [occasion("2026-09-08"), occasion("2026-09-22"), occasion("2026-09-29")],
      at("2026-09-30"),
    );
    expect(result.weeks.map((week) => [week.status, week.streak, week.bonus])).toEqual([
      ["COMPLETED", 1, 0],
      ["PAUSED", 1, 0],
      ["COMPLETED", 2, 2],
      ["COMPLETED", 3, 3],
    ]);
  });

  it("una oportunidad perdida termina la racha y la siguiente asistencia empieza en uno", () => {
    const result = state([
      occasion("2026-09-08"),
      occasion("2026-09-15", { checkInStatus: null }),
      occasion("2026-09-22"),
    ]);
    expect(result.weeks.map((week) => [week.status, week.streak])).toEqual([
      ["COMPLETED", 1],
      ["MISSED", 0],
      ["COMPLETED", 1],
      ["PAUSED", 1],
    ]);
  });

  it("la semana en curso sigue pendiente aunque la actividad disponible todavía no haya ocurrido", () => {
    const result = state(
      [occasion("2026-09-08"), occasion("2026-09-19", { checkInStatus: null })],
      at("2026-09-15"),
    );
    expect(result).toMatchObject({
      currentStreak: 1,
      weekStatus: "PENDING",
      bonus: 0,
      nextBonus: 2,
    });
  });

  it("un evento publicado tarde nunca convierte una pausa pasada en falta, pero asistir sí suma", () => {
    const late = occasion("2026-09-15", { openedAt: at("2026-09-14"), checkInStatus: null });
    expect(state([occasion("2026-09-08"), late]).weeks[1]?.status).toBe("PAUSED");
    expect(
      state([occasion("2026-09-08"), { ...late, checkInStatus: "APPROVED" }]).weeks[1],
    ).toMatchObject({ status: "COMPLETED", streak: 2, bonus: 2 });
  });

  it("canceladas y borradores no son asistencia ni oportunidad", () => {
    const result = state([
      occasion("2026-09-08"),
      occasion("2026-09-15", { status: "CANCELLED" }),
      occasion("2026-09-16", { status: "DRAFT" }),
    ]);
    expect(result.currentStreak).toBe(1);
    expect(result.weeks[1]?.status).toBe("PAUSED");
  });

  it("una actividad exclusiva de otro comité o de nuevos no crea una falta", () => {
    const result = state(
      [
        occasion("2026-09-15", { committeeId: "otro", checkInStatus: null }),
        occasion("2026-09-16", { newMembersOnly: true, checkInStatus: null }),
      ],
      at("2026-09-28"),
      { member: { ...member, firstTermId: "anterior" } },
    );
    expect(result.weeks[1]?.status).toBe("PAUSED");
  });

  it("una excusa pausa si cubre la única oportunidad, pero no elimina otra oportunidad sin excusa", () => {
    const excused = occasion("2026-09-15", { checkInStatus: "EXCUSED" });
    expect(state([occasion("2026-09-08"), excused]).weeks[1]?.status).toBe("PAUSED");
    expect(
      state([occasion("2026-09-08"), excused, occasion("2026-09-16", { checkInStatus: null })])
        .weeks[1]?.status,
    ).toBe("MISSED");
  });

  it("la licencia aprobada pausa la semana sin generar puntos", () => {
    const history: PresenceMemberHistory = {
      ...member,
      changes: [
        { at: at("2026-09-14"), from: "ACTIVE", to: "ON_LEAVE" },
        { at: at("2026-09-21"), from: "ON_LEAVE", to: "ACTIVE" },
      ],
    };
    const result = state(
      [
        occasion("2026-09-08"),
        occasion("2026-09-15", { checkInStatus: null }),
        occasion("2026-09-22"),
      ],
      at("2026-09-28"),
      { member: history },
    );
    expect(result.weeks[1]).toMatchObject({ status: "PAUSED", streak: 1, bonus: 0 });
    expect(result.currentStreak).toBe(2);
  });

  it("una asistencia aprobada durante la licencia conserva la pausa sin sumar semana ni bono", () => {
    const history: PresenceMemberHistory = {
      ...member,
      changes: [
        { at: at("2026-09-14"), from: "ACTIVE", to: "ON_LEAVE" },
        { at: at("2026-09-21"), from: "ON_LEAVE", to: "ACTIVE" },
      ],
    };
    const result = state(
      [occasion("2026-09-08"), occasion("2026-09-15"), occasion("2026-09-22")],
      at("2026-09-28"),
      { member: history },
    );
    expect(result.weeks[1]).toMatchObject({ status: "PAUSED", streak: 1, bonus: 0 });
    expect(result.weeks[2]).toMatchObject({ status: "COMPLETED", streak: 2, bonus: 2 });
  });

  it("una asistencia anterior a iniciar licencia en la misma semana sí conserva su constancia", () => {
    const result = state([occasion("2026-09-08"), occasion("2026-09-15")], at("2026-09-21"), {
      member: {
        ...member,
        status: "ON_LEAVE",
        changes: [{ at: at("2026-09-16"), from: "ACTIVE", to: "ON_LEAVE" }],
      },
    });
    expect(result.weeks[1]).toMatchObject({ status: "COMPLETED", streak: 2, bonus: 2 });
  });

  it("el ingreso a mitad de semana descarta las oportunidades previas al ingreso", () => {
    const result = state([occasion("2026-09-08", { checkInStatus: null })], at("2026-09-14"), {
      member: { ...member, joinedAt: at("2026-09-11") },
    });
    expect(result.weeks[0]?.status).toBe("PAUSED");
  });

  it("reconoce toda la historia sin pagar bonos por actividades anteriores al lanzamiento", () => {
    const result = state(
      [
        occasion("2026-09-08"),
        occasion("2026-09-15"),
        occasion("2026-09-22"),
        occasion("2026-09-29"),
      ],
      at("2026-09-30"),
      { launchedAt: at("2026-09-25") },
    );
    expect(result.currentStreak).toBe(4);
    expect(result.weeks.map((week) => week.bonus)).toEqual([0, 0, 0, 5]);
  });

  it("el corte civil es el lunes a medianoche de Colombia y el semestre empieza en cero", () => {
    const result = state([
      { ...occasion("2026-09-14"), startsAt: new Date("2026-09-14T04:59:59Z") },
      { ...occasion("2026-09-14"), startsAt: new Date("2026-09-14T05:00:00Z") },
    ]);
    expect(result.weeks.slice(0, 2).map((week) => week.streak)).toEqual([1, 2]);
    expect(
      state([occasion("2026-09-08")], at("2026-09-30"), {
        term: { id: "nuevo", startsOn: "2026-09-21", endsOn: term.endsOn },
      }).currentStreak,
    ).toBe(0);
  });

  it("la escala tiene techo cinco y entrega cincuenta puntos en doce semanas", () => {
    expect(Array.from({ length: 12 }, (_, index) => presenceBonusFor(index + 1))).toEqual([
      0, 2, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5,
    ]);
    expect(
      Array.from({ length: 12 }, (_, index) => presenceBonusFor(index + 1)).reduce(
        (sum, points) => sum + points,
        0,
      ),
    ).toBe(50);
  });
});
