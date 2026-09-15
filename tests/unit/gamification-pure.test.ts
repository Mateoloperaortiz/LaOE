import { describe, expect, it } from "vitest";
import {
  audienceIncludes,
  badgeProgress,
  boosterExpiresAt,
  boosterPercent,
  boosterState,
  challengeState,
  computeReward,
  dayKeyFor,
  gradeTrivia,
  isVoluntaryOccasion,
  memberChallengeStatus,
  unlockedLevel,
  weekKeyFor,
} from "@/modules/participation/domain/gamification-pure";
import type {
  CampaignPercent,
  PersonalPercent,
  RewardBreakdown,
} from "@/modules/participation/gamification-types";

const CAPS = { daily: 20, weekly: 60 };

type RewardCase = [
  {
    base: number;
    personalPercent: PersonalPercent;
    campaignPercent: 0 | CampaignPercent;
    usedDaily: number;
    usedWeekly: number;
  },
  Partial<RewardBreakdown>,
];

describe("economía de la gamificación (ADR-067)", () => {
  it.each<RewardCase>([
    // El ejemplo del pedido: 10 base con +50 % personal y +50 % de campaña = 20 antes del tope.
    [
      { base: 10, personalPercent: 50, campaignPercent: 50, usedDaily: 0, usedWeekly: 0 },
      {
        baseGranted: 10,
        extraGranted: 10,
        extraRequested: 10,
        personalConsumed: true,
        capped: false,
      },
    ],
    // Personal + campaña no superan +100 %; al cubrir la campaña todo el extra, el booster no se consume.
    [
      { base: 10, personalPercent: 100, campaignPercent: 100, usedDaily: 0, usedWeekly: 0 },
      {
        baseGranted: 10,
        extraGranted: 10,
        extraRequested: 10,
        personalConsumed: false,
        capped: false,
      },
    ],
    // El extra se redondea hacia abajo.
    [
      { base: 7, personalPercent: 50, campaignPercent: 0, usedDaily: 0, usedWeekly: 0 },
      { baseGranted: 7, extraGranted: 3, extraRequested: 3, personalConsumed: true, capped: false },
    ],
    // Cupo diario casi agotado: la base se recorta y el booster no se consume.
    [
      { base: 10, personalPercent: 50, campaignPercent: 0, usedDaily: 15, usedWeekly: 0 },
      { baseGranted: 5, extraGranted: 0, extraRequested: 5, personalConsumed: false, capped: true },
    ],
    // El extra entra justo hasta la campaña: el booster no aporta por encima, no se consume.
    [
      { base: 10, personalPercent: 50, campaignPercent: 50, usedDaily: 5, usedWeekly: 0 },
      {
        baseGranted: 10,
        extraGranted: 5,
        extraRequested: 10,
        personalConsumed: false,
        capped: true,
      },
    ],
    // Un punto más de cupo lo aporta el booster: sí se consume.
    [
      { base: 10, personalPercent: 50, campaignPercent: 50, usedDaily: 4, usedWeekly: 0 },
      {
        baseGranted: 10,
        extraGranted: 6,
        extraRequested: 10,
        personalConsumed: true,
        capped: true,
      },
    ],
    // Solo campaña del 25 %.
    [
      { base: 10, personalPercent: 0, campaignPercent: 25, usedDaily: 0, usedWeekly: 0 },
      {
        baseGranted: 10,
        extraGranted: 2,
        extraRequested: 2,
        personalConsumed: false,
        capped: false,
      },
    ],
    // El tope semanal también limita: quedan 5 aunque el día esté vacío.
    [
      { base: 10, personalPercent: 0, campaignPercent: 0, usedDaily: 0, usedWeekly: 55 },
      { baseGranted: 5, extraGranted: 0, extraRequested: 0, personalConsumed: false, capped: true },
    ],
  ])("computeReward %# reparte base, extra y cupo", (input, expected) => {
    const breakdown = computeReward({ ...input, caps: CAPS });
    expect(breakdown).toMatchObject(expected);
  });

  it("computeReward con topes en cero no entrega nada", () => {
    const breakdown = computeReward({
      base: 10,
      personalPercent: 100,
      campaignPercent: 100,
      usedDaily: 0,
      usedWeekly: 0,
      caps: { daily: 0, weekly: 0 },
    });
    expect(breakdown).toMatchObject({
      baseGranted: 0,
      extraGranted: 0,
      personalConsumed: false,
      capped: true,
    });
  });

  it("mapea el porcentaje de cada booster", () => {
    expect(boosterPercent("PLUS_50")).toBe(50);
    expect(boosterPercent("PLUS_100")).toBe(100);
  });

  it("fija el día y el lunes de la semana en el reloj de Colombia", () => {
    // Domingo 23:30 de Bogotá pertenece a la semana que abrió el lunes anterior.
    expect(weekKeyFor(new Date("2026-09-14T04:30:00Z"))).toBe("2026-09-07");
    // Lunes 00:10 de Bogotá abre una semana nueva.
    expect(weekKeyFor(new Date("2026-09-14T05:10:00Z"))).toBe("2026-09-14");
    expect(dayKeyFor(new Date("2026-09-15T04:59:00Z"))).toBe("2026-09-14");
    expect(dayKeyFor(new Date("2026-09-15T05:00:00Z"))).toBe("2026-09-15");
  });

  it("deriva el estado del reto desde la fila persistida y la ventana", () => {
    const window = {
      opensAt: new Date("2026-09-20T05:00:00Z"),
      closesAt: new Date("2026-09-22T05:00:00Z"),
    };
    const now = new Date("2026-09-21T05:00:00Z");
    expect(challengeState({ ...window, status: "DRAFT" }, now)).toBe("DRAFT");
    expect(challengeState({ ...window, status: "CANCELLED" }, now)).toBe("CANCELLED");
    expect(challengeState({ ...window, status: "PUBLISHED" }, now)).toBe("OPEN");
    expect(
      challengeState({ ...window, status: "PUBLISHED" }, new Date("2026-09-19T05:00:00Z")),
    ).toBe("SCHEDULED");
    expect(
      challengeState({ ...window, status: "PUBLISHED" }, new Date("2026-09-22T05:00:00Z")),
    ).toBe("CLOSED");
  });

  it("proyecta el estado del miembro sin filtrar la fila privada", () => {
    expect(memberChallengeStatus("OPEN", null)).toBe("AVAILABLE");
    expect(memberChallengeStatus("SCHEDULED", null)).toBe("AVAILABLE");
    expect(memberChallengeStatus("CLOSED", null)).toBe("EXPIRED");
    expect(memberChallengeStatus("CANCELLED", null)).toBe("EXPIRED");
    expect(memberChallengeStatus("DRAFT", null)).toBe("EXPIRED");
    expect(memberChallengeStatus("OPEN", { status: "PENDING" })).toBe("PENDING");
    expect(memberChallengeStatus("CLOSED", { status: "PENDING" })).toBe("PENDING");
    expect(memberChallengeStatus("OPEN", { status: "COMPLETED" })).toBe("COMPLETED");
    expect(memberChallengeStatus("OPEN", { status: "REJECTED" })).toBe("REJECTED");
    expect(memberChallengeStatus("OPEN", { status: "ANNULLED" })).toBe("REJECTED");
  });

  it("evalúa el público congelado contra la membresía elegible", () => {
    const reto = { termId: "term-actual", audience: "ALL" as const, audienceCommitteeIds: [] };
    const activa = { status: "ACTIVE" as const, firstTermId: "term-actual", committeeIds: [] };
    const honoraria = { ...activa, status: "HONORARY" as const };
    expect(audienceIncludes(reto, activa)).toBe(true);
    expect(audienceIncludes(reto, honoraria)).toBe(true);
    expect(audienceIncludes(reto, null)).toBe(false);
    for (const status of ["ON_LEAVE", "INACTIVE"] as const) {
      expect(audienceIncludes(reto, { ...activa, status })).toBe(false);
    }
    expect(audienceIncludes({ ...reto, audience: "NEW" }, activa)).toBe(true);
    expect(
      audienceIncludes({ ...reto, audience: "NEW" }, { ...activa, firstTermId: "term-viejo" }),
    ).toBe(false);
    expect(
      audienceIncludes({ ...reto, audience: "VETERAN" }, { ...activa, firstTermId: "term-viejo" }),
    ).toBe(true);
    expect(audienceIncludes({ ...reto, audience: "VETERAN" }, activa)).toBe(false);
    const porComites = {
      ...reto,
      audience: "COMMITTEES" as const,
      audienceCommitteeIds: ["c1", "c2"],
    };
    expect(audienceIncludes(porComites, { ...activa, committeeIds: ["c9"] })).toBe(false);
    expect(audienceIncludes(porComites, { ...activa, committeeIds: ["c2", "c9"] })).toBe(true);
  });

  it("califica la trivia sin flotantes y exige el umbral", () => {
    expect(gradeTrivia([0, 1, 2, 0, 1], [0, 1, 2, 3, 4], 80)).toEqual({
      score: 3,
      total: 5,
      passed: false,
    });
    expect(gradeTrivia([0, 1, 2, 3, 0], [0, 1, 2, 3, 4], 80)).toEqual({
      score: 4,
      total: 5,
      passed: true,
    });
    expect(gradeTrivia([2], [2], 100)).toEqual({ score: 1, total: 1, passed: true });
    expect(gradeTrivia([0], [2], 100)).toEqual({ score: 0, total: 1, passed: false });
    // Menos respuestas que preguntas: las que faltan cuentan como error.
    expect(gradeTrivia([0, 1], [0, 1, 2, 3, 4], 80).score).toBe(2);
  });

  it("reconoce una actividad voluntaria (ni reunión de comité ni inducción)", () => {
    expect(isVoluntaryOccasion({ kind: "ACTIVITY", category: "SOCIAL" })).toBe(true);
    expect(isVoluntaryOccasion({ kind: "EDITION_SESSION", category: "OTHER" })).toBe(true);
    expect(isVoluntaryOccasion({ kind: "ACTIVITY", category: "COMMITTEE_MEETING" })).toBe(false);
    expect(isVoluntaryOccasion({ kind: "EDITION_SESSION", category: "INDUCTION" })).toBe(false);
    expect(isVoluntaryOccasion({ kind: "ASSEMBLY", category: "OTHER" })).toBe(false);
  });

  it("vence el booster a las 23:59:59.999 del último día del término en Bogotá", () => {
    expect(boosterExpiresAt({ endsOn: "2026-12-05" }).toISOString()).toBe(
      "2026-12-06T04:59:59.999Z",
    );
  });

  it("deriva el vencimiento del booster sin tocar los ya decididos", () => {
    const future = new Date(Date.now() + 86_400_000);
    const past = new Date(Date.now() - 86_400_000);
    const now = new Date();
    expect(boosterState({ status: "AVAILABLE", expiresAt: future }, now)).toBe("AVAILABLE");
    expect(boosterState({ status: "AVAILABLE", expiresAt: past }, now)).toBe("EXPIRED");
    expect(boosterState({ status: "RESERVED", expiresAt: past }, now)).toBe("RESERVED");
    expect(boosterState({ status: "CONSUMED", expiresAt: past }, now)).toBe("CONSUMED");
    expect(boosterState({ status: "REVOKED", expiresAt: future }, now)).toBe("REVOKED");
  });

  it("cuenta niveles y progreso de insignias por umbrales", () => {
    const thresholds = [1, 5, 15];
    expect(unlockedLevel(0, thresholds)).toBe(0);
    expect(unlockedLevel(1, thresholds)).toBe(1);
    expect(unlockedLevel(4, thresholds)).toBe(1);
    expect(unlockedLevel(5, thresholds)).toBe(2);
    expect(unlockedLevel(15, thresholds)).toBe(3);
    expect(unlockedLevel(40, thresholds)).toBe(3);
    expect(badgeProgress(0, thresholds)).toEqual({ level: 0, next: 1, current: 0 });
    expect(badgeProgress(3, thresholds)).toEqual({ level: 1, next: 5, current: 3 });
    expect(badgeProgress(15, thresholds)).toEqual({ level: 3, next: null, current: 15 });
  });
});
