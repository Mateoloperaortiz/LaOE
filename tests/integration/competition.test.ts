import { asc, eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  addAdjustmentAs,
  advanceRotationAs,
  assignStaffAs,
  type CompetitionActor,
  cancelMarketAs,
  clearCaptainsAs,
  clearRouteMemo,
  clearShowcaseMemo,
  closeRotationAs,
  competitionRoles,
  createCompetitionAs,
  createExtraAs,
  createMarketAs,
  createTeamAs,
  creditBalances,
  deleteDayScheduleAs,
  enterHubAs,
  generateDayScheduleAs,
  getCompetition,
  getHubState,
  getHubTeam,
  getLiveRotations,
  getScheduleForValidation,
  getShowcase,
  getTeamRoute,
  grantStartingCreditsAs,
  importCaptainsAs,
  importDayScheduleAs,
  issueTeamCodesAs,
  listCaptains,
  listExtras,
  listMyCompetitionRoles,
  listRegistrationCandidates,
  listStandings,
  placeBetAs,
  placeHubBetAs,
  recordResultAs,
  resolveMarketAs,
  saveBaseAs,
  saveRotationMatchupsAs,
  setCaptainsVisibilityAs,
  setCompetitionStatusAs,
  setExtraPointsAs,
  setMarketOpenAs,
  setRubricScoresAs,
  setStandingsVisibilityAs,
  startRotationAs,
  updateCompetitionSettingsAs,
  validateSchedule,
  voidResultAs,
} from "@/modules/competition";
import { clearHubFailures } from "@/modules/competition/domain/hub";
import { HUB_MAX_FAILURES_PER_IP, HUB_TERMS_VERSION } from "@/modules/competition/domain/hub-pure";
import { dayOneRounds } from "@/modules/competition/domain/schedule-pure";
import {
  competitionBase,
  competitionBet,
  competitionCreditEntry,
  competitionMarket,
  competitionRotation,
  competitionTeam,
} from "@/modules/competition/schema";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { addMacroeventDirector } from "@/modules/people/domain/appointments";
import { membership } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { seedForm, seedMember, seedSubmission, seedTerm, seedVeteran } from "../factories";
import { heldThenSettled, holdTransaction, outcome } from "../helpers/locks";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

// The Games (ADR-089, ADR-091): acceso por datos, calendario de 30 equipos y 15 bases, rotaciones,
// resultados con reversión, extras idempotentes y apuestas que no pagan dos veces.

let diasEventId: string | null = null;

/** Una edición de Días EAFIT; las dos de la prueba cuelgan del mismo evento `dias-eafit`. */
async function seedDiasEdition(slug = "2026"): Promise<string> {
  if (!diasEventId) {
    const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createEvent(ctx, {
        slug: "dias-eafit",
        name: "Días EAFIT",
        summary: "",
        description: "",
        audience: "PUBLIC",
        publicationStatus: "PUBLISHED",
        sortOrder: 1,
      }),
    );
    diasEventId = evento.id;
  }
  const eventId = diasEventId;
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId,
      slug,
      name: slug,
      description: "",
      startsAt: new Date(`${slug}-09-28T13:00:00Z`),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return edicion.id;
}

const admin = (personId: string): CompetitionActor => ({ personId, isAdmin: true, ip: null });
const member = (personId: string): CompetitionActor => ({ personId, isAdmin: false, ip: null });

async function seedCompetition() {
  const termId = await seedTerm();
  const editionId = await seedDiasEdition();
  const adminId = await seedMember("admin-games@example.com");
  const { id } = await createCompetitionAs(admin(adminId), {
    editionId,
    slug: "the-games-2026",
    name: "The Games 2026",
  });
  return { id, editionId, termId, adminId };
}

/** 30 equipos y 15 bases por jornada; las bases 5 y 10 de cada día son de inflables. */
async function seedField(competitionId: string, adminId: string) {
  const actor = admin(adminId);
  const teams: string[] = [];
  for (let n = 1; n <= 30; n++) {
    const { id } = await createTeamAs(actor, competitionId, { number: n, name: `Equipo ${n}` });
    teams.push(id);
  }
  const bases: Record<1 | 2, string[]> = { 1: [], 2: [] };
  for (const day of [1, 2] as const) {
    for (let i = 0; i < 15; i++) {
      const { id } = await saveBaseAs(actor, competitionId, null, {
        day,
        orderIndex: i,
        name: `Base ${day}-${i + 1}`,
        kind: i === 4 || i === 9 ? "MACRO" : "NORMAL",
      });
      bases[day].push(id);
    }
  }
  return { teams, bases };
}

describe("The Games", () => {
  beforeEach(async () => {
    await truncateAll();
    diasEventId = null;
  });
  afterAll(() => closeDb());

  describe("acceso", () => {
    it("opera ADMIN, la Dirección de The Games de la edición y el operador asignado; nadie más", async () => {
      const { id, editionId, termId, adminId } = await seedCompetition();
      const directorId = await seedVeteran("direccion-games@example.com");
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, {
          editionId,
          termId,
          personId: directorId,
          roleCode: "THE_GAMES",
        }),
      );
      const otherEdition = await seedDiasEdition("2027");
      const outsiderId = await seedVeteran("otra-edicion@example.com");
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, {
          editionId: otherEdition,
          termId,
          personId: outsiderId,
          roleCode: "THE_GAMES",
        }),
      );
      const plainId = await seedMember("sin-rol@example.com");

      expect((await competitionRoles(admin(adminId), id)).operator).toBe(true);
      expect((await competitionRoles(member(directorId), id)).operator).toBe(true);
      expect((await competitionRoles(member(outsiderId), id)).operator).toBe(false);
      expect((await competitionRoles(member(plainId), id)).operator).toBe(false);
      await expect(
        createTeamAs(member(outsiderId), id, { number: 1, name: "Intruso" }),
      ).rejects.toThrow(t("T-2764"));

      // La Dirección asigna un operador; el operador no puede asignar otros operadores.
      await assignStaffAs(member(directorId), id, { personId: plainId, role: "OPERATOR" });
      expect((await competitionRoles(member(plainId), id)).operator).toBe(true);
      const anotherId = await seedMember("otro@example.com");
      await expect(
        assignStaffAs(member(plainId), id, { personId: anotherId, role: "OPERATOR" }),
      ).rejects.toThrow(t("T-2765"));

      // En licencia no opera, aunque tenga el cargo.
      await getDb()
        .update(membership)
        .set({ status: "ON_LEAVE" })
        .where(eq(membership.personId, directorId));
      expect((await competitionRoles(member(directorId), id)).operator).toBe(false);

      const mine = await listMyCompetitionRoles(member(plainId));
      expect(mine.map((row) => row.slug)).toEqual(["the-games-2026"]);
      expect(await listMyCompetitionRoles(member(anotherId))).toEqual([]);
    });

    it("el juez registra solo en su base y en la rotación en curso", async () => {
      const { id, adminId } = await seedCompetition();
      const { bases } = await seedField(id, adminId);
      const judgeId = await seedMember("juez@example.com");
      await assignStaffAs(admin(adminId), id, {
        personId: judgeId,
        role: "JUDGE",
        baseId: bases[1][0],
      });
      await generateDayScheduleAs(admin(adminId), id, {
        day: 1,
        rotations: 15,
        plannedMinutes: 20,
      });
      const pending = await getLiveRotations(id);
      const first = pending.next?.matchups.find((m) => m.base.id === bases[1][0]);
      if (!first || !pending.next) throw new Error("sin calendario");
      await expect(
        recordResultAs(member(judgeId), id, { matchupId: first.id, outcome: "A_WIN" }),
      ).rejects.toThrow(t("T-2775"));
      await startRotationAs(admin(adminId), id, pending.next.id);
      await recordResultAs(member(judgeId), id, { matchupId: first.id, outcome: "A_WIN" });
      const other = pending.next.matchups.find((m) => m.base.id !== bases[1][0]);
      if (!other) throw new Error("sin otra base");
      await expect(
        recordResultAs(member(judgeId), id, { matchupId: other.id, outcome: "DRAW" }),
      ).rejects.toThrow(t("T-2764"));
      expect((await competitionRoles(member(judgeId), id)).judgeBaseIds).toEqual([bases[1][0]]);
    });

    it("el juez registra una sola vez y cambiarlo es de la operación (ADR-106)", async () => {
      const { id, adminId } = await seedCompetition();
      const { bases } = await seedField(id, adminId);
      const judgeId = await seedMember("juez-bloqueo@example.com");
      await assignStaffAs(admin(adminId), id, {
        personId: judgeId,
        role: "JUDGE",
        baseId: bases[1][0],
      });
      await generateDayScheduleAs(admin(adminId), id, {
        day: 1,
        rotations: 15,
        plannedMinutes: 20,
      });
      const pending = await getLiveRotations(id);
      const own = pending.next?.matchups.find((m) => m.base.id === bases[1][0]);
      if (!own || !pending.next) throw new Error("sin calendario");
      await startRotationAs(admin(adminId), id, pending.next.id);
      const judge = member(judgeId);

      const first = await recordResultAs(judge, id, { matchupId: own.id, outcome: "A_WIN" });
      // Un doble toque no falla ni cambia nada; otro resultado se rechaza.
      expect(await recordResultAs(judge, id, { matchupId: own.id, outcome: "A_WIN" })).toEqual({
        changed: false,
        resultId: first.resultId,
      });
      await expect(
        recordResultAs(judge, id, { matchupId: own.id, outcome: "DRAW" }),
      ).rejects.toThrow(t("T-3200"));
      const corrected = await recordResultAs(admin(adminId), id, {
        matchupId: own.id,
        outcome: "DRAW",
      });
      expect(corrected.changed).toBe(true);

      // Si la operación lo anula con la rotación en curso, el líder lo vuelve a registrar.
      await voidResultAs(admin(adminId), id, own.id);
      const again = await recordResultAs(judge, id, { matchupId: own.id, outcome: "B_WIN" });
      expect(again.changed).toBe(true);
    });
  });

  describe("calendario y rotaciones", () => {
    it("genera las dos jornadas: 1 contra 30 primero, sin errores y una revancha por equipo", async () => {
      const { id, adminId } = await seedCompetition();
      const { teams } = await seedField(id, adminId);
      const day1 = await generateDayScheduleAs(admin(adminId), id, {
        day: 1,
        rotations: 15,
        plannedMinutes: 20,
      });
      const day2 = await generateDayScheduleAs(admin(adminId), id, {
        day: 2,
        rotations: 15,
        plannedMinutes: 45,
      });
      expect(day1).toEqual({ rotations: 15, matchups: 225 });
      expect(day2).toEqual({ rotations: 15, matchups: 225 });
      const schedule = await getScheduleForValidation(id);
      const report = validateSchedule(schedule.rotations, schedule.teams, schedule.bases);
      expect(report.errors).toEqual([]);
      expect(report.errors.filter((e) => e.kind === "BASE_REPEATED_IN_DAY")).toEqual([]);
      expect(report.warnings.filter((w) => w.kind === "REPEATED_PAIR")).toHaveLength(15);
      const first = schedule.rotations.find((r) => r.day === 1 && r.number === 1);
      const opponentOfOne = first?.matchups.find(
        (m) => m.teamAId === teams[0] || m.teamBId === teams[0],
      );
      expect([opponentOfOne?.teamAId, opponentOfOne?.teamBId]).toContain(teams[29]);
      await expect(
        generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 15, plannedMinutes: 20 }),
      ).rejects.toThrow(t("T-2771", { dia: 1 }));
    });

    it("pide el doble de equipos que de bases", async () => {
      const { id, adminId } = await seedCompetition();
      await createTeamAs(admin(adminId), id, { number: 1, name: "Solo" });
      await saveBaseAs(admin(adminId), id, null, { day: 1, orderIndex: 0, name: "A" });
      await expect(
        generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 1, plannedMinutes: 10 }),
      ).rejects.toThrow();
    });

    it("una sola rotación en curso; cerrar deja pendientes y avanzar inicia la siguiente", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 3, plannedMinutes: 20 });
      const { next } = await getLiveRotations(id);
      if (!next) throw new Error("sin rotación");
      await startRotationAs(admin(adminId), id, next.id);
      const again = await getLiveRotations(id);
      if (!again.next) throw new Error("sin siguiente");
      await expect(startRotationAs(admin(adminId), id, again.next.id)).rejects.toThrow(t("T-2773"));
      const results = await Promise.allSettled([
        advanceRotationAs(admin(adminId), id),
        advanceRotationAs(admin(adminId), id),
      ]);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      const live = await getLiveRotations(id);
      expect(live.current?.number).toBe(3);
      await closeRotationAs(admin(adminId), id, live.current?.id ?? "");
      const after = await getLiveRotations(id);
      expect(after.current).toBeNull();
    });

    // ADR-118 regla 28: «siguiente» es la primera pendiente de la jornada en curso o de una posterior.
    it("con una rotación de la jornada 1 sin jugar, «Avanzar» y la siguiente de la vitrina siguen con la jornada 2", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      const actor = admin(adminId);
      await generateDayScheduleAs(actor, id, { day: 1, rotations: 2, plannedMinutes: 20 });
      await generateDayScheduleAs(actor, id, { day: 2, rotations: 2, plannedMinutes: 20 });
      await setCompetitionStatusAs(actor, id, "LIVE");
      const rotations = await getDb()
        .select()
        .from(competitionRotation)
        .where(eq(competitionRotation.competitionId, id));
      const idOf = (day: number, number: number) =>
        rotations.find((rotation) => rotation.day === day && rotation.number === number)?.id ?? "";
      const place = (rotation: { day: number; number: number } | null | undefined) =>
        rotation ? `J${rotation.day}-R${rotation.number}` : null;
      const publicNext = async () => {
        clearShowcaseMemo();
        return place((await getShowcase("the-games-2026", new Date()))?.nextRotation);
      };

      // La jornada 1 se queda sin tiempo: se juega la primera rotación y la segunda queda pendiente.
      await startRotationAs(actor, id, idOf(1, 1));
      await closeRotationAs(actor, id, idOf(1, 1));
      // Mientras nadie arranque la jornada 2, la que sigue es la que quedó.
      expect(place((await getLiveRotations(id)).next)).toBe("J1-R2");

      // Al otro día el operador inicia a mano la primera de la jornada 2.
      await startRotationAs(actor, id, idOf(2, 1));
      const operatorNext = place((await getLiveRotations(id)).next);
      const showcaseNext = await publicNext();
      const advanced = await advanceRotationAs(actor, id);
      expect({
        operatorNext,
        showcaseNext,
        advancedTo: place((await getLiveRotations(id)).current),
        advanced,
      }).toEqual({
        operatorNext: "J2-R2",
        showcaseNext: "J2-R2",
        advancedTo: "J2-R2",
        advanced: { rotationId: idOf(2, 2) },
      });

      // A la jornada 2 no le queda ninguna: no hay siguiente, y «Avanzar» cierra sin iniciar la que sobró.
      expect(place((await getLiveRotations(id)).next)).toBeNull();
      expect(await publicNext()).toBeNull();
      expect(await advanceRotationAs(actor, id)).toEqual({ rotationId: null });
      expect((await getLiveRotations(id)).current).toBeNull();

      // La que quedó pendiente no se pierde: sigue ahí y se puede iniciar a mano.
      await startRotationAs(actor, id, idOf(1, 2));
      expect(place((await getLiveRotations(id)).current)).toBe("J1-R2");
    });

    it("editar una rotación: los errores bloquean, también repetir base en la jornada", async () => {
      const { id, adminId } = await seedCompetition();
      const { teams, bases } = await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 2, plannedMinutes: 20 });
      const { next } = await getLiveRotations(id);
      if (!next) throw new Error("sin rotación");
      const rows = next.matchups.map((m) => ({
        baseId: m.base.id,
        teamAId: m.teamA.id,
        teamBId: m.teamB.id,
      }));
      const broken = rows.map((row, index) =>
        index === 0 ? { ...row, teamBId: row.teamAId } : row,
      );
      const refused = await saveRotationMatchupsAs(admin(adminId), id, next.id, {
        matchups: broken,
      });
      expect(refused.saved).toBe(false);
      expect(refused.report.errors.map((e) => e.kind)).toContain("SELF_MATCH");
      // Las bases 1 y 2: los equipos de la base 1 juegan la rotación 2 en la base 2, así que
      // intercambiarlas los haría repetir base. Es error y no se guarda ni confirmando (ADR-093).
      const [a, b, c] = rows;
      if (!a || !b || !c) throw new Error("pocos enfrentamientos");
      const repeating = [{ ...a, baseId: b.baseId }, { ...b, baseId: a.baseId }, ...rows.slice(2)];
      const blocked = await saveRotationMatchupsAs(admin(adminId), id, next.id, {
        matchups: repeating,
        confirmWarnings: true,
      });
      expect(blocked.saved).toBe(false);
      expect(blocked.report.errors.map((e) => e.kind)).toContain("BASE_REPEATED_IN_DAY");
      // Las bases 1 y 3 sí se pueden intercambiar: nadie repite.
      const swapped = rows.map((row, index) =>
        index === 0
          ? { ...row, baseId: c.baseId }
          : index === 2
            ? { ...row, baseId: a.baseId }
            : row,
      );
      const saved = await saveRotationMatchupsAs(admin(adminId), id, next.id, {
        matchups: swapped,
      });
      expect(saved.saved).toBe(true);
      expect(saved.report.errors).toEqual([]);
      void teams;
      void bases;
    });
  });

  describe("resultados y posiciones", () => {
    it("puntos del servidor por tipo de base, repetir no suma y corregir revierte", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 1, plannedMinutes: 20 });
      const { next } = await getLiveRotations(id);
      if (!next) throw new Error("sin rotación");
      await startRotationAs(admin(adminId), id, next.id);
      const normal = next.matchups.find((m) => m.base.kind === "NORMAL");
      const macro = next.matchups.find((m) => m.base.kind === "MACRO");
      if (!normal || !macro) throw new Error("faltan bases");
      const actor = admin(adminId);
      await recordResultAs(actor, id, { matchupId: normal.id, outcome: "A_WIN" });
      expect(
        (await recordResultAs(actor, id, { matchupId: normal.id, outcome: "A_WIN" })).changed,
      ).toBe(false);
      await recordResultAs(actor, id, { matchupId: macro.id, outcome: "DRAW" });
      let standings = await listStandings(id);
      const points = (teamId: string) =>
        standings.overall.find((row) => row.teamId === teamId)?.points ?? 0;
      expect(points(normal.teamA.id)).toBe(1000);
      expect(points(normal.teamB.id)).toBe(0);
      expect(points(macro.teamA.id)).toBe(1000);
      expect(points(macro.teamB.id)).toBe(1000);

      await recordResultAs(actor, id, { matchupId: normal.id, outcome: "B_WIN" });
      standings = await listStandings(id);
      expect(points(normal.teamA.id)).toBe(0);
      expect(points(normal.teamB.id)).toBe(1000);
      expect(standings.day1.find((row) => row.teamId === normal.teamB.id)?.wins).toBe(1);
      expect(standings.day2.every((row) => row.points === 0)).toBe(true);

      await voidResultAs(actor, id, normal.id);
      standings = await listStandings(id);
      expect(points(normal.teamB.id)).toBe(0);
      expect(standings.overall.find((row) => row.teamId === normal.teamB.id)?.played).toBe(0);
    });

    it("las competencias extra dejan el total pedido y el ajuste pide motivo", async () => {
      const { id, adminId } = await seedCompetition();
      const { teams } = await seedField(id, adminId);
      const actor = admin(adminId);
      const extra = await createExtraAs(actor, id, { name: "Competencia de talentos", day: 1 });
      const team = teams[0] ?? "";
      await setExtraPointsAs(actor, id, { extraId: extra.id, teamId: team, total: 800 });
      await setExtraPointsAs(actor, id, { extraId: extra.id, teamId: team, total: 800 });
      await setExtraPointsAs(actor, id, { extraId: extra.id, teamId: team, total: 600 });
      const standings = await listStandings(id);
      expect(standings.day1.find((row) => row.teamId === team)?.points).toBe(600);
      await expect(
        addAdjustmentAs(actor, id, { teamId: team, day: 1, points: 50, reason: "" }),
      ).rejects.toThrow(t("T-2789"));
      await addAdjustmentAs(actor, id, {
        teamId: team,
        day: 2,
        points: 50,
        reason: "Juego limpio",
      });
      expect((await listStandings(id)).overall.find((row) => row.teamId === team)?.points).toBe(
        650,
      );
    });

    it("la rúbrica de The Challenge da el total × 10 en el jueves y repetir no suma", async () => {
      const { id, adminId } = await seedCompetition();
      const { teams } = await seedField(id, adminId);
      const actor = admin(adminId);
      const extra = await createExtraAs(actor, id, {
        name: "Competencia de talentos",
        day: 1,
        kind: "THE_CHALLENGE_RUBRIC",
      });
      const team = teams[0] ?? "";
      await expect(
        setExtraPointsAs(actor, id, { extraId: extra.id, teamId: team, total: 500 }),
      ).rejects.toThrow(t("T-2899"));
      await expect(
        setRubricScoresAs(actor, id, { extraId: extra.id, teamId: team, scores: [10, 10, 10] }),
      ).rejects.toThrow(t("T-2898"));
      await expect(
        setRubricScoresAs(actor, id, {
          extraId: extra.id,
          teamId: team,
          scores: [10, 10, 10, 10, 11],
        }),
      ).rejects.toThrow(t("T-2898"));
      const first = await setRubricScoresAs(actor, id, {
        extraId: extra.id,
        teamId: team,
        scores: [8, 6, 10, 5, 10],
      });
      expect(first).toMatchObject({ points: 771, delta: 771 });
      const again = await setRubricScoresAs(actor, id, {
        extraId: extra.id,
        teamId: team,
        scores: [8, 6, 10, 5, 10],
      });
      expect(again.delta).toBe(0);
      const corrected = await setRubricScoresAs(actor, id, {
        extraId: extra.id,
        teamId: team,
        scores: [10, 10, 10, 10, 10],
      });
      expect(corrected).toMatchObject({ total: 100, points: 1000, delta: 229 });
      const standings = await listStandings(id);
      expect(standings.day1.find((row) => row.teamId === team)?.points).toBe(1000);
      expect(standings.overall.find((row) => row.teamId === team)?.points).toBe(1000);
      expect(standings.day2.find((row) => row.teamId === team)?.points).toBe(0);
      const [view] = await listExtras(id);
      expect(view?.rubric?.criteria.map((criterion) => criterion.weight)).toEqual([
        20, 20, 20, 15, 10,
      ]);
      expect(view?.rubric?.teams.get(team)).toMatchObject({
        scores: [10, 10, 10, 10, 10],
        total: 100,
        level: "EXCELLENT",
      });
    });

    it("un equipo sale de una respuesta del formulario ligado, una sola vez", async () => {
      const { id, adminId } = await seedCompetition();
      const formId = await seedForm("the-games-2026", {
        actions: { createPerson: false },
        fields: [{ key: "equipo", label: "Nombre del equipo", type: "TEXT", required: true }],
      });
      const otherForm = await seedForm("otro-formulario");
      const submission = await seedSubmission(formId, "capitan@example.com", {
        answers: { equipo: "Los Titanes" },
      });
      const foreign = await seedSubmission(otherForm, "ajeno@example.com");
      const actor = admin(adminId);
      await updateCompetitionSettingsAs(actor, id, {
        name: "The Games 2026",
        registrationFormId: formId,
      });
      await createTeamAs(actor, id, { number: 1, name: "Los Titanes", submissionId: submission });
      await expect(
        createTeamAs(actor, id, { number: 2, name: "Otro", submissionId: submission }),
      ).rejects.toThrow(t("T-2768"));
      await expect(
        createTeamAs(actor, id, { number: 3, name: "Ajeno", submissionId: foreign }),
      ).rejects.toThrow(t("T-2768"));
      await expect(createTeamAs(actor, id, { number: 1, name: "Repetido" })).rejects.toThrow(
        t("T-2766", { n: 1 }),
      );
      const candidates = await listRegistrationCandidates(id);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ teamName: "Los Titanes" });
      expect(JSON.stringify(candidates)).not.toContain("@");
    });
  });

  describe("apuestas", () => {
    async function seedBetting() {
      const base = await seedCompetition();
      const actor = admin(base.adminId);
      const teamIds: string[] = [];
      for (let n = 1; n <= 3; n++) {
        teamIds.push((await createTeamAs(actor, base.id, { number: n, name: `E${n}` })).id);
      }
      await updateCompetitionSettingsAs(actor, base.id, {
        name: "The Games 2026",
        bettingEnabled: true,
        startingCredits: 1000,
      });
      await grantStartingCreditsAs(actor, base.id);
      expect((await grantStartingCreditsAs(actor, base.id)).granted).toBe(0);
      const codes = await issueTeamCodesAs(actor, base.id, false);
      const code = (teamId: string) => codes.find((c) => c.teamId === teamId)?.code ?? "";
      const market = await createMarketAs(actor, base.id, {
        title: "¿Quién gana la base de inflables?",
        teamIds: [teamIds[0] ?? "", teamIds[1] ?? ""],
      });
      await setMarketOpenAs(actor, base.id, market.id, true);
      return { ...base, actor, teamIds, code, marketId: market.id };
    }

    it("apuesta con código, descuenta el saldo, no duplica y paga una sola vez", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      const first = await placeBetAs(actor, id, {
        marketId,
        teamId: t3,
        pickTeamId: t1,
        stake: 300,
        code: code(t3),
      });
      expect(first).toMatchObject({ ok: true, balance: 700 });
      await expect(
        placeBetAs(actor, id, { marketId, teamId: t3, pickTeamId: t2, stake: 1, code: code(t3) }),
      ).rejects.toThrow(t("T-2783"));
      await expect(
        placeBetAs(actor, id, { marketId, teamId: t1, pickTeamId: t1, stake: 1, code: code(t1) }),
      ).rejects.toThrow(t("T-2785"));
      await expect(
        placeBetAs(actor, id, {
          marketId,
          teamId: t2,
          pickTeamId: t1,
          stake: 5000,
          code: code(t2),
        }),
      ).rejects.toThrow(t("T-2782", { saldo: 1000 }));
      await placeBetAs(actor, id, {
        marketId,
        teamId: t2,
        pickTeamId: t1,
        stake: 100,
        code: code(t2),
      });
      await placeBetAs(actor, id, {
        marketId,
        teamId: t1,
        pickTeamId: t2,
        stake: 200,
        code: code(t1),
      });

      const [a, b] = await Promise.all([
        resolveMarketAs(actor, id, marketId, t1),
        resolveMarketAs(actor, id, marketId, t1),
      ]);
      expect(a.paid + b.paid).toBe(600);
      const balances = await creditBalances(id);
      // t3 apostó 300 y t2 100 por t1, que ganó; la bolsa perdedora (200) se reparte 3:1.
      expect(balances.get(t3)).toBe(700 + 450);
      expect(balances.get(t2)).toBe(900 + 150);
      expect(balances.get(t1)).toBe(800);
      const total = [...balances.values()].reduce((sum, value) => sum + value, 0);
      expect(total).toBe(3000);
    });

    // ADR-118 regla 29. Cómo se corrige una apuesta mal resuelta es la decisión abierta 41: hoy no hay
    // comando. Esta prueba fija lo que no cambia: nada se mueve y cancelar una resuelta se rechaza.
    it("resolver otra vez con otro ganador responde que ya está resuelta; con el mismo no hace nada (decisión abierta 41)", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      await placeBetAs(actor, id, {
        marketId,
        teamId: t3,
        pickTeamId: t1,
        stake: 300,
        code: code(t3),
      });
      await placeBetAs(actor, id, {
        marketId,
        teamId: t1,
        pickTeamId: t2,
        stake: 200,
        code: code(t1),
      });
      expect(await resolveMarketAs(actor, id, marketId, t1)).toEqual({ paid: 500 });
      const state = async () => {
        const db = getDb();
        const [market] = await db
          .select()
          .from(competitionMarket)
          .where(eq(competitionMarket.id, marketId));
        const entries = await db
          .select({ id: competitionCreditEntry.id })
          .from(competitionCreditEntry)
          .where(eq(competitionCreditEntry.competitionId, id));
        const audits = await db
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(eq(auditLog.action, "competition.market.resolve"));
        return {
          status: market?.status,
          winnerTeamId: market?.winnerTeamId,
          resolvedAt: market?.resolvedAt,
          balances: [...(await creditBalances(id)).entries()].sort(),
          entries: entries.length,
          audits: audits.length,
        };
      };
      const resolved = await state();
      expect(resolved).toMatchObject({ status: "RESOLVED", winnerTeamId: t1, audits: 1 });

      const again = await Promise.allSettled([resolveMarketAs(actor, id, marketId, t2)]);
      expect(again.map(outcome)).toEqual([t("T-3255")]);
      // Con el mismo ganador sigue siendo idempotente (ADR-091 regla 4).
      expect(await resolveMarketAs(actor, id, marketId, t1)).toEqual({ paid: 0 });
      await expect(cancelMarketAs(actor, id, marketId)).rejects.toThrow(t("T-2792"));
      expect(await state()).toEqual(resolved);
    });

    it("dos operadores resuelven a la vez con ganadores distintos: uno queda y el otro recibe que ya está resuelta", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      await placeBetAs(actor, id, {
        marketId,
        teamId: t3,
        pickTeamId: t1,
        stake: 300,
        code: code(t3),
      });
      await placeBetAs(actor, id, {
        marketId,
        teamId: t1,
        pickTeamId: t2,
        stake: 200,
        code: code(t1),
      });
      await warmPool();
      const results = await Promise.allSettled([
        resolveMarketAs(actor, id, marketId, t1),
        resolveMarketAs(actor, id, marketId, t2),
      ]);
      expect(results.map(outcome).sort()).toEqual(["ok", t("T-3255")].sort());
      const [market] = await getDb()
        .select()
        .from(competitionMarket)
        .where(eq(competitionMarket.id, marketId));
      expect(market?.winnerTeamId).toBe(results[0]?.status === "fulfilled" ? t1 : t2);
      // Se pagó una sola vez: los puntos de las tres cuentas siguen sumando lo repartido.
      const total = [...(await creditBalances(id)).values()].reduce((sum, value) => sum + value, 0);
      expect(total).toBe(3000);
    });

    it("una apuesta que encuentra el mercado tomado por otro escritor lo espera y lo vuelve a leer: cerrado, no entra", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const t1 = teamIds[0] ?? "";
      const t3 = teamIds[2] ?? "";
      // El otro escritor es sintético: cierra la apuesta sin tomar la fila de la competencia, que hoy
      // toman todos los comandos del módulo y por eso cubre a la prueba de arriba. Así lo único que
      // hace esperar a quien apuesta es el `for update` del mercado en `lockedMarket` (DT-335).
      const held = await holdTransaction((tx) =>
        tx
          .update(competitionMarket)
          .set({ status: "CLOSED" })
          .where(eq(competitionMarket.id, marketId)),
      );
      const { during, after } = await heldThenSettled(held, () =>
        placeBetAs(actor, id, { marketId, teamId: t3, pickTeamId: t1, stake: 300, code: code(t3) }),
      );

      // Sin el mercado bajo candado la apuesta lo lee abierto, no espera a nadie y entra en uno cerrado.
      expect(during).toBe("hizo cola");
      expect(outcome(after)).toBe(t("T-2781"));
      expect(await getDb().select().from(competitionBet)).toHaveLength(0);
      expect(
        await getDb()
          .select()
          .from(competitionCreditEntry)
          .where(eq(competitionCreditEntry.kind, "STAKE")),
      ).toHaveLength(0);
    });

    it("un código errado queda contado y a los cinco se bloquea", async () => {
      const { id, actor, teamIds, marketId } = await seedBetting();
      const [t1 = "", t2 = ""] = teamIds;
      for (let i = 0; i < 4; i++) {
        const result = await placeBetAs(actor, id, {
          marketId,
          teamId: t2,
          pickTeamId: t1,
          stake: 10,
          code: "0000-0000",
        });
        expect(result).toEqual({ ok: false, message: t("T-2778") });
      }
      const fifth = await placeBetAs(actor, id, {
        marketId,
        teamId: t2,
        pickTeamId: t1,
        stake: 10,
        code: "0000-0000",
      });
      expect(fifth.ok).toBe(false);
      const [team] = await getDb().select().from(competitionTeam).where(eq(competitionTeam.id, t2));
      expect(team?.codeLockedUntil).not.toBeNull();
    });

    it("dos apuestas simultáneas del mismo equipo no gastan más que el saldo", async () => {
      const { id, actor, teamIds, code } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      const other = await createMarketAs(actor, id, { title: "Otra", teamIds: [t1, t2] });
      await setMarketOpenAs(actor, id, other.id, true);
      const markets = await createMarketAs(actor, id, { title: "Tercera", teamIds: [t1, t2] });
      await setMarketOpenAs(actor, id, markets.id, true);
      await warmPool();
      const results = await Promise.allSettled([
        placeBetAs(actor, id, {
          marketId: other.id,
          teamId: t3,
          pickTeamId: t1,
          stake: 700,
          code: code(t3),
        }),
        placeBetAs(actor, id, {
          marketId: markets.id,
          teamId: t3,
          pickTeamId: t1,
          stake: 700,
          code: code(t3),
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await creditBalances(id)).get(t3)).toBe(300);
    });

    it("una apuesta que encuentra al equipo tomado por otro escritor lo espera y lo vuelve a leer: retirado, no apuesta", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const t1 = teamIds[0] ?? "";
      const t3 = teamIds[2] ?? "";
      // El otro escritor es sintético: retira al equipo sin tomar la fila de la competencia ni el
      // consultivo de su saldo, que hoy cubren a la prueba de arriba. Así lo único que hace esperar a
      // quien apuesta es el `for update` del equipo en `placeBet` (DT-335).
      const held = await holdTransaction((tx) =>
        tx.update(competitionTeam).set({ status: "WITHDRAWN" }).where(eq(competitionTeam.id, t3)),
      );
      const { during, after } = await heldThenSettled(held, () =>
        placeBetAs(actor, id, { marketId, teamId: t3, pickTeamId: t1, stake: 300, code: code(t3) }),
      );

      // Sin el equipo bajo candado la apuesta lo lee activo, no espera a nadie y le descuenta el saldo
      // a un equipo retirado.
      expect(during).toBe("hizo cola");
      expect(outcome(after)).toBe(t("T-2764"));
      expect(await getDb().select().from(competitionBet)).toHaveLength(0);
      expect(
        await getDb()
          .select()
          .from(competitionCreditEntry)
          .where(eq(competitionCreditEntry.kind, "STAKE")),
      ).toHaveLength(0);
    });

    it("cancelar devuelve todo y una apuesta cerrada no recibe más", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      await placeBetAs(actor, id, {
        marketId,
        teamId: t3,
        pickTeamId: t1,
        stake: 400,
        code: code(t3),
      });
      await setMarketOpenAs(actor, id, marketId, false);
      await expect(
        placeBetAs(actor, id, { marketId, teamId: t2, pickTeamId: t1, stake: 1, code: code(t2) }),
      ).rejects.toThrow(t("T-2781"));
      await cancelMarketAs(actor, id, marketId);
      await cancelMarketAs(actor, id, marketId);
      expect((await creditBalances(id)).get(t3)).toBe(1000);
      const refunds = await getDb()
        .select()
        .from(competitionCreditEntry)
        .where(eq(competitionCreditEntry.kind, "REFUND"));
      expect(refunds).toHaveLength(1);
    });

    it("la general suma los puntos de apuestas sin descontar las que siguen abiertas (ADR-104)", async () => {
      const { id, actor, teamIds, code, marketId } = await seedBetting();
      const [t1 = "", t2 = "", t3 = ""] = teamIds;
      const overall = async (teamId: string) =>
        (await listStandings(id)).overall.find((row) => row.teamId === teamId)?.points;
      expect(await overall(t1)).toBe(1000);
      // Lo apostado sigue contando mientras la apuesta no se resuelva, aunque ya esté cerrada.
      await placeBetAs(actor, id, {
        marketId,
        teamId: t3,
        pickTeamId: t1,
        stake: 300,
        code: code(t3),
      });
      await placeBetAs(actor, id, {
        marketId,
        teamId: t1,
        pickTeamId: t2,
        stake: 200,
        code: code(t1),
      });
      expect((await creditBalances(id)).get(t3)).toBe(700);
      expect(await overall(t3)).toBe(1000);
      await setMarketOpenAs(actor, id, marketId, false);
      expect(await overall(t1)).toBe(1000);
      // Al resolver, la general queda en el saldo: t1 acertó y se lleva la bolsa de t3.
      await resolveMarketAs(actor, id, marketId, t2);
      expect(await overall(t1)).toBe(1300);
      expect(await overall(t2)).toBe(1000);
      expect(await overall(t3)).toBe(700);
      expect((await listStandings(id)).day1.every((row) => row.points === 0)).toBe(true);
      await updateCompetitionSettingsAs(actor, id, {
        name: "The Games 2026",
        bettingEnabled: false,
        startingCredits: 1000,
      });
      expect(await overall(t1)).toBe(0);
    });

    describe("hub de capitanes (ADR-096)", () => {
      beforeEach(() => clearHubFailures());
      const hub = (ip = "10.1.2.3") => ({ personId: null, ip });

      it("entra con el código del equipo y apuesta con el mismo núcleo del operador", async () => {
        const { id, actor, teamIds, code, marketId } = await seedBetting();
        const [e1 = "", e2 = "", e3 = ""] = teamIds;
        // Mientras la competencia no esté en vivo, el código no abre el hub.
        expect(await enterHubAs(hub(), code(e1))).toEqual({
          ok: false,
          reason: "INVALID",
          message: t("T-3036"),
        });
        await setCompetitionStatusAs(actor, id, "LIVE");
        const raw = code(e1);
        // La primera vez, el equipo tiene que aceptar las instrucciones (ADR-099): sin aceptarlas no
        // hay sesión, y no cuenta como fallo.
        expect(await enterHubAs(hub(), raw)).toEqual({
          ok: false,
          reason: "TERMS",
          version: HUB_TERMS_VERSION,
          message: t("T-3120"),
        });
        const entered = await enterHubAs(
          hub(),
          `${raw.slice(0, 4).toLowerCase()}-${raw.slice(4)}`,
          HUB_TERMS_VERSION,
        );
        if (!entered.ok) throw new Error(entered.message);
        const [accepted] = await getDb()
          .select({
            version: competitionTeam.hubTermsVersion,
            at: competitionTeam.hubTermsAcceptedAt,
          })
          .from(competitionTeam)
          .where(eq(competitionTeam.id, e1));
        expect(accepted?.version).toBe(HUB_TERMS_VERSION);
        expect(accepted?.at).toBeInstanceOf(Date);
        const [terms] = await getDb()
          .select({ entityId: auditLog.entityId, ip: auditLog.ip })
          .from(auditLog)
          .where(eq(auditLog.action, "competition.hub.terms"));
        expect(terms).toEqual({ entityId: e1, ip: "10.1.2.3" });
        expect(entered.session).toMatchObject({ competitionId: id, teamId: e1 });
        expect(await getHubTeam(entered.session)).toMatchObject({
          teamId: e1,
          number: 1,
          name: "E1",
        });

        // El hub elige por número de equipo: 1 es el propio, 3 no es opción y 99 no existe.
        const bet = (pick: number, stake: number) =>
          placeHubBetAs(hub(), entered.session, { marketId, pick, stake });
        await expect(bet(1, 100)).rejects.toThrow(t("T-2785"));
        await expect(bet(2, 5000)).rejects.toThrow(t("T-2782", { saldo: 1000 }));
        await expect(bet(3, 100)).rejects.toThrow(t("T-2784"));
        await expect(bet(99, 100)).rejects.toThrow(t("T-2784"));
        expect(await bet(2, 300)).toMatchObject({ balance: 700 });
        await expect(bet(2, 100)).rejects.toThrow(t("T-2783"));
        const state = await getHubState(entered.session);
        expect(state?.route).toEqual([]);
        expect(state).toMatchObject({
          team: { number: 1, name: "E1" },
          balance: 700,
          markets: [{ id: marketId, myBet: { pick: 2, stake: 300 } }],
          bets: [{ marketId, pick: { number: 2 }, stake: 300, result: "PENDING", amount: 0 }],
        });
        expect(JSON.stringify(state)).not.toContain(e1);
        expect(JSON.stringify(state)).not.toContain(e3);
        // El operador ve la misma apuesta: el equipo ya apostó en esta.
        await expect(
          placeBetAs(actor, id, { marketId, teamId: e1, pickTeamId: e2, stake: 100, code: raw }),
        ).rejects.toThrow(t("T-2783"));
        const [placed] = await getDb()
          .select()
          .from(competitionBet)
          .where(eq(competitionBet.teamId, e1));
        expect(placed?.createdById).toBeNull();
        const [audit] = await getDb()
          .select({ after: auditLog.after, ip: auditLog.ip, actorId: auditLog.actorId })
          .from(auditLog)
          .where(eq(auditLog.action, "competition.bet.place"));
        expect(audit).toMatchObject({ ip: "10.1.2.3", actorId: null, after: { via: "HUB" } });
        const [entry] = await getDb()
          .select({ ip: auditLog.ip })
          .from(auditLog)
          .where(eq(auditLog.action, "competition.hub.enter"));
        expect(entry?.ip).toBe("10.1.2.3");

        // Una apuesta cerrada ya no recibe apuestas desde el hub.
        await setMarketOpenAs(actor, id, marketId, false);
        const other = await enterHubAs(hub(), code(e2), HUB_TERMS_VERSION);
        if (!other.ok) throw new Error(other.message);
        await expect(
          placeHubBetAs(hub(), other.session, { marketId, pick: 1, stake: 50 }),
        ).rejects.toThrow(t("T-2781"));
        expect((await getHubState(other.session))?.markets).toEqual([]);
      });

      it("las instrucciones se aceptan una vez por equipo y la sesión exige la versión vigente", async () => {
        const { id, actor, teamIds, code, marketId } = await seedBetting();
        const [e1 = ""] = teamIds;
        await setCompetitionStatusAs(actor, id, "LIVE");
        const first = await enterHubAs(hub(), code(e1), HUB_TERMS_VERSION);
        if (!first.ok) throw new Error(first.message);
        // El otro capitán entra con el mismo código sin volver a aceptar.
        const second = await enterHubAs(hub("10.7.7.7"), code(e1));
        if (!second.ok) throw new Error(second.message);
        // Si la versión vigente sube, las sesiones abiertas dejan de valer y el hub vuelve a pedirla.
        await getDb()
          .update(competitionTeam)
          .set({ hubTermsVersion: 0 })
          .where(eq(competitionTeam.id, e1));
        expect(await getHubTeam(second.session)).toBeNull();
        await expect(
          placeHubBetAs(hub(), second.session, { marketId, pick: 2, stake: 50 }),
        ).rejects.toThrow(t("T-3038"));
        expect(await enterHubAs(hub(), code(e1))).toMatchObject({ ok: false, reason: "TERMS" });
      });

      it("los fallos cuentan por IP, respeta el bloqueo y volver a emitir cierra las sesiones", async () => {
        const { id, actor, teamIds, code, marketId } = await seedBetting();
        const [e1 = ""] = teamIds;
        await setCompetitionStatusAs(actor, id, "LIVE");
        const entered = await enterHubAs(hub(), code(e1), HUB_TERMS_VERSION);
        if (!entered.ok) throw new Error(entered.message);
        for (let i = 0; i < HUB_MAX_FAILURES_PER_IP; i++) {
          expect(await enterHubAs(hub("10.9.9.9"), "ZZZZ-ZZZZ")).toEqual({
            ok: false,
            reason: "INVALID",
            message: t("T-3036"),
          });
        }
        expect(await enterHubAs(hub("10.9.9.9"), code(e1))).toEqual({
          ok: false,
          reason: "RATE_LIMITED",
          message: t("T-3037"),
        });
        expect((await enterHubAs(hub("10.8.8.8"), code(e1))).ok).toBe(true);
        const failed = await getDb()
          .select({ entityId: auditLog.entityId, after: auditLog.after })
          .from(auditLog)
          .where(eq(auditLog.action, "competition.hub.code-failed"));
        expect(failed).toHaveLength(HUB_MAX_FAILURES_PER_IP);
        expect(JSON.stringify(failed)).not.toContain("ZZZZ");

        // El bloqueo del código por fallos ante el operador también cierra el hub.
        await getDb()
          .update(competitionTeam)
          .set({ codeLockedUntil: new Date(Date.now() + 60_000) })
          .where(eq(competitionTeam.id, e1));
        expect(await enterHubAs(hub(), code(e1))).toMatchObject({ ok: false, reason: "LOCKED" });
        await getDb()
          .update(competitionTeam)
          .set({ codeLockedUntil: null })
          .where(eq(competitionTeam.id, e1));

        // Volver a emitir los códigos deja sin valor la sesión abierta.
        await issueTeamCodesAs(actor, id, false);
        expect(await getHubTeam(entered.session)).toBeNull();
        await expect(
          placeHubBetAs(hub(), entered.session, { marketId, pick: 2, stake: 10 }),
        ).rejects.toThrow(t("T-3038"));
        expect(await getHubState(entered.session)).toBeNull();
      });

      it("una sesión que ya no vale rechaza la apuesta con la razón SESSION; una apuesta mal hecha no la lleva (ADR-114)", async () => {
        const { id, actor, teamIds, code, marketId } = await seedBetting();
        const [e1 = ""] = teamIds;
        await setCompetitionStatusAs(actor, id, "LIVE");
        const entered = await enterHubAs(hub(), code(e1), HUB_TERMS_VERSION);
        if (!entered.ok) throw new Error(entered.message);
        const bet = (pick: number) =>
          placeHubBetAs(hub(), entered.session, { marketId, pick, stake: 50 });
        const sessionGone = { reason: "SESSION", message: t("T-3038") };
        const setTeam = (values: { status?: "ACTIVE" | "WITHDRAWN"; hubTermsVersion?: number }) =>
          getDb().update(competitionTeam).set(values).where(eq(competitionTeam.id, e1));

        // Apostar por el propio equipo es una regla de la apuesta: error de dominio, sin razón.
        const selfBet = await bet(1).catch((error: unknown) => error);
        expect(selfBet).toBeInstanceOf(DomainError);
        expect(selfBet).toMatchObject({ message: t("T-2785") });
        expect(selfBet).not.toHaveProperty("reason");

        // Cada motivo por el que la sesión deja de valer lleva la razón, además del texto.
        await setCompetitionStatusAs(actor, id, "DRAFT");
        await expect(bet(2)).rejects.toMatchObject(sessionGone);
        await setCompetitionStatusAs(actor, id, "LIVE");
        await setTeam({ hubTermsVersion: HUB_TERMS_VERSION - 1 });
        await expect(bet(2)).rejects.toMatchObject(sessionGone);
        await setTeam({ hubTermsVersion: HUB_TERMS_VERSION, status: "WITHDRAWN" });
        await expect(bet(2)).rejects.toMatchObject(sessionGone);
        await setTeam({ status: "ACTIVE" });
        // Con todo de vuelta en su sitio la misma sesión apuesta: lo que fallaba era cada motivo.
        expect(await bet(2)).toMatchObject({ balance: 950 });
        await issueTeamCodesAs(actor, id, false);
        const reissued = await bet(2).catch((error: unknown) => error);
        expect(reissued).toBeInstanceOf(DomainError);
        expect(reissued).toMatchObject(sessionGone);
      });
    });
  });

  describe("importar la hoja de la OE", () => {
    /** Una jornada como la hoja de la OE: una fila por equipo y rotación, con encabezado. */
    function sheet(
      nameOf: (seed: number) => string = (seed) => `Equipo ${seed}`,
      firstRotation = 1,
      firstBase = 1,
    ): string {
      const lines = ["Equipo\tRotacion\tBase\tRival"];
      for (const [index, round] of dayOneRounds(15).entries()) {
        const rotation = firstRotation + index;
        for (const { base, a, b } of round) {
          const number = firstBase + base;
          lines.push(`${nameOf(a)}\t${rotation}\t${number}\t${nameOf(b)}`);
          lines.push(`${nameOf(b)}\t${rotation}\t${number}\t${nameOf(a)}`);
        }
      }
      return lines.join("\r\n");
    }

    it("crea los equipos, las bases y las 15 rotaciones de una competencia vacía", async () => {
      const { id, adminId } = await seedCompetition();
      const result = await importDayScheduleAs(admin(adminId), id, {
        day: 1,
        plannedMinutes: 18,
        text: sheet((seed) => `Equipo de la hoja ${seed}`),
      });
      expect(result).toMatchObject({
        saved: true,
        rotations: 15,
        matchups: 225,
        teamsCreated: 30,
        basesCreated: 15,
      });
      const teams = await getDb()
        .select()
        .from(competitionTeam)
        .where(eq(competitionTeam.competitionId, id));
      expect(teams).toHaveLength(30);
      // Numerados en el orden de la columna Equipo: la hoja empieza por la rotación 1, base 1.
      expect(teams.find((team) => team.number === 1)?.name).toBe("Equipo de la hoja 1");
      const bases = await getDb()
        .select()
        .from(competitionBase)
        .where(eq(competitionBase.competitionId, id));
      expect(bases.map((base) => base.name).sort()).toContain("Base 15");
      expect(bases.every((base) => base.day === 1 && base.kind === "NORMAL")).toBe(true);
      const rotations = await getDb()
        .select()
        .from(competitionRotation)
        .where(eq(competitionRotation.competitionId, id));
      expect(rotations).toHaveLength(15);
      expect(rotations.every((rotation) => rotation.plannedSeconds === 18 * 60)).toBe(true);
      const loaded = await getScheduleForValidation(id);
      expect(validateSchedule(loaded.rotations, loaded.teams, loaded.bases).errors).toEqual([]);

      await expect(
        importDayScheduleAs(admin(adminId), id, { day: 1, plannedMinutes: 18, text: sheet() }),
      ).rejects.toThrow(t("T-2921", { dia: 1 }));
    });

    it("una hoja con errores o con un equipo desconocido no guarda nada", async () => {
      const { id, adminId } = await seedCompetition();
      const broken = `${sheet()}\r\nEquipo 1\t1\t2\tEquipo 2`;
      const first = await importDayScheduleAs(admin(adminId), id, {
        day: 1,
        plannedMinutes: 20,
        text: broken,
      });
      expect(first.saved).toBe(false);
      expect(first.errors[0]).toContain("Línea 452");
      expect(
        await getDb().select().from(competitionTeam).where(eq(competitionTeam.competitionId, id)),
      ).toHaveLength(0);

      await seedField(id, adminId);
      const unknown = await importDayScheduleAs(admin(adminId), id, {
        day: 1,
        plannedMinutes: 20,
        text: sheet((seed) => (seed === 7 ? "Equipo siete" : `equipo  ${seed}`)),
      });
      expect(unknown).toMatchObject({
        saved: false,
        errors: [t("T-2917", { nombre: "Equipo siete" })],
      });
      expect(
        await getDb()
          .select()
          .from(competitionRotation)
          .where(eq(competitionRotation.competitionId, id)),
      ).toHaveLength(0);

      // Con los nombres de la competencia, aunque cambien mayúsculas y espacios, entra en sus bases.
      const matched = await importDayScheduleAs(admin(adminId), id, {
        day: 1,
        plannedMinutes: 20,
        text: sheet((seed) => `equipo  ${seed}`),
      });
      expect(matched).toMatchObject({ saved: true, teamsCreated: 0, basesCreated: 0 });
    });

    it("si la jornada ya tiene bases, la hoja las busca por su número y si no, por su puesto", async () => {
      const { id, adminId } = await seedCompetition();
      await importDayScheduleAs(admin(adminId), id, { day: 1, plannedMinutes: 20, text: sheet() });
      // El viernes numera sus bases del 16 al 30, en ese orden.
      const friday: string[] = [];
      for (let i = 0; i < 15; i++) {
        const base = await saveBaseAs(admin(adminId), id, null, {
          day: 2,
          orderIndex: i,
          name: `Base ${16 + i}`,
        });
        friday.push(base.id);
      }
      const byNumber = await importDayScheduleAs(admin(adminId), id, {
        day: 2,
        plannedMinutes: 45,
        text: sheet(undefined, 16, 16),
        confirmWarnings: true,
      });
      expect(byNumber).toMatchObject({ saved: true, basesCreated: 0 });
      const loaded = await getScheduleForValidation(id);
      const first = loaded.rotations.find(
        (rotation) => rotation.day === 2 && rotation.number === 16,
      );
      // En la rotación 1 del generador, la base 0 enfrenta al 1 con el 30: aquí es la «Base 16».
      const opening = first?.matchups.find((matchup) => matchup.baseId === friday[0]);
      const names = new Map(
        (
          await getDb()
            .select({ id: competitionTeam.id, name: competitionTeam.name })
            .from(competitionTeam)
            .where(eq(competitionTeam.competitionId, id))
        ).map((team) => [team.id, team.name]),
      );
      expect([names.get(opening?.teamAId ?? ""), names.get(opening?.teamBId ?? "")].sort()).toEqual(
        ["Equipo 1", "Equipo 30"],
      );

      // La misma hoja con las bases del 1 al 15 entra por puesto.
      await deleteDayScheduleAs(admin(adminId), id, 2);
      const byPosition = await importDayScheduleAs(admin(adminId), id, {
        day: 2,
        plannedMinutes: 45,
        text: sheet(undefined, 16),
        confirmWarnings: true,
      });
      expect(byPosition).toMatchObject({ saved: true, basesCreated: 0 });
    });

    it("los cruces repetidos con la otra jornada piden confirmar", async () => {
      const { id, adminId } = await seedCompetition();
      await importDayScheduleAs(admin(adminId), id, {
        day: 1,
        plannedMinutes: 20,
        text: sheet(),
      });
      // La hoja del viernes sigue la numeración del jueves: de la 16 a la 30.
      const friday = sheet(undefined, 16);
      const again = await importDayScheduleAs(admin(adminId), id, {
        day: 2,
        plannedMinutes: 45,
        text: friday,
      });
      expect(again.saved).toBe(false);
      expect(again.errors).toEqual([]);
      expect(again.warnings).toHaveLength(225);
      expect(again.warnings[0]).toContain(t("T-2841").split(" · ")[6] ?? "");
      const confirmed = await importDayScheduleAs(admin(adminId), id, {
        day: 2,
        plannedMinutes: 45,
        text: friday,
        confirmWarnings: true,
      });
      expect(confirmed).toMatchObject({ saved: true, teamsCreated: 0, basesCreated: 15 });
      const numbers = (
        await getDb()
          .select({ day: competitionRotation.day, number: competitionRotation.number })
          .from(competitionRotation)
          .where(eq(competitionRotation.competitionId, id))
      )
        .filter((rotation) => rotation.day === 2)
        .map((rotation) => rotation.number)
        .sort((x, y) => x - y);
      expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => i + 16));
    });
  });

  describe("vitrina", () => {
    it("un borrador no es público; en vivo sale la rotación en curso sin datos personales", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      clearShowcaseMemo();
      expect(await getShowcase("the-games-2026")).toBeNull();
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 2, plannedMinutes: 20 });
      await setCompetitionStatusAs(admin(adminId), id, "LIVE");
      await advanceRotationAs(admin(adminId), id);
      clearShowcaseMemo();
      const showcase = await getShowcase("the-games-2026", new Date());
      expect(showcase?.competition.status).toBe("LIVE");
      expect(showcase?.currentRotation?.matchups).toHaveLength(15);
      expect(showcase?.nextRotation?.number).toBe(2);
      expect(showcase?.standings.overall).toHaveLength(30);
      const json = JSON.stringify(showcase);
      expect(json).not.toContain("@example.com");
      expect(json).not.toContain(adminId);
    });
  });

  describe("recorrido (ADR-097)", () => {
    it("cada equipo ve sus bases, su rival y cómo le fue, sin ids", async () => {
      const { id, adminId } = await seedCompetition();
      const { teams } = await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 2, plannedMinutes: 20 });
      clearRouteMemo();
      expect(await getTeamRoute("the-games-2026", 1)).toBeNull();
      await setCompetitionStatusAs(admin(adminId), id, "LIVE");
      await advanceRotationAs(admin(adminId), id);

      clearRouteMemo();
      const route = await getTeamRoute("the-games-2026", 1);
      expect(route?.team).toMatchObject({ number: 1, name: "Equipo 1" });
      expect(route?.stops.map(({ day, rotation, status }) => ({ day, rotation, status }))).toEqual([
        { day: 1, rotation: 1, status: "ACTIVE" },
        { day: 1, rotation: 2, status: "PENDING" },
      ]);
      expect(route?.stops[0]).toMatchObject({ result: null, points: null });

      const { current } = await getLiveRotations(id);
      const mine = current?.matchups.find(
        (matchup) => matchup.teamA.number === 1 || matchup.teamB.number === 1,
      );
      if (!mine) throw new Error("sin enfrentamiento del equipo 1");
      const rival = mine.teamA.number === 1 ? mine.teamB : mine.teamA;
      expect(route?.stops[0]).toMatchObject({
        base: { name: mine.base.name, kind: mine.base.kind },
        rival: { number: rival.number, name: rival.name },
      });
      await recordResultAs(admin(adminId), id, {
        matchupId: mine.id,
        outcome: mine.teamA.number === 1 ? "A_WIN" : "B_WIN",
      });
      clearRouteMemo();
      const after = await getTeamRoute("the-games-2026", 1);
      expect(after?.stops[0]).toMatchObject({
        result: "WIN",
        points: mine.base.kind === "MACRO" ? 2000 : 1000,
      });
      clearRouteMemo();
      expect((await getTeamRoute("the-games-2026", rival.number))?.stops[0]).toMatchObject({
        result: "LOSS",
        points: 0,
      });
      expect(JSON.stringify(after)).not.toContain(teams[0] ?? "sin-id");
      expect(await getTeamRoute("the-games-2026", 99)).toBeNull();
    });
  });

  describe("capitanes (ADR-095)", () => {
    // Nombres y celulares sintéticos, pegados como vienen de la hoja: con encabezado y con signos.
    const sheet = [
      "Equipo\tNombre\tCelular",
      "Equipo 1\tAna de Ensayo\t300 000 0001",
      "Equipo 1\tLuis de Ensayo\t3000000002",
      "Equipo 30\tSara de Ensayo\t+57 3000000030",
    ].join("\n");

    it("el ADMIN carga, cada carga reemplaza y una hoja con problemas no guarda nada", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      expect(await importCaptainsAs(admin(adminId), id, { text: sheet })).toMatchObject({
        saved: true,
        captains: 3,
        teams: 2,
      });
      expect(
        (await listCaptains(id)).map(({ position, name, phone }) => ({ position, name, phone })),
      ).toEqual([
        { position: 1, name: "Ana de Ensayo", phone: "3000000001" },
        { position: 2, name: "Luis de Ensayo", phone: "3000000002" },
        { position: 1, name: "Sara de Ensayo", phone: "3000000030" },
      ]);

      const blocked = await importCaptainsAs(admin(adminId), id, {
        text: "Equipo 2\tTomás de Ensayo\t3000000003\nEquipo 31\tNadie de Ensayo\t3000000031",
      });
      expect(blocked).toMatchObject({ saved: false, captains: 0 });
      expect(blocked.errors).toEqual([t("T-3024", { linea: 2, equipo: "Equipo 31" })]);
      expect(await listCaptains(id)).toHaveLength(3);

      await importCaptainsAs(admin(adminId), id, { text: "2\tTomás de Ensayo\t" });
      expect((await listCaptains(id)).map(({ name, phone }) => ({ name, phone }))).toEqual([
        { name: "Tomás de Ensayo", phone: null },
      ]);

      // La auditoría solo cuenta: ni nombres ni celulares.
      const rows = await getDb()
        .select({ action: auditLog.action, before: auditLog.before, after: auditLog.after })
        .from(auditLog)
        .where(like(auditLog.action, "competition.captains.%"));
      expect(rows.map((row) => row.after)).toEqual([
        { captains: 3, teams: 2 },
        { captains: 1, teams: 1 },
      ]);
      const audited = JSON.stringify(rows);
      expect(audited).not.toContain("Ensayo");
      expect(audited).not.toMatch(/30000000\d\d/);
    });

    it("la Dirección opera la competencia y ve los capitanes, pero no carga, publica ni borra", async () => {
      const { id, editionId, termId, adminId } = await seedCompetition();
      await seedField(id, adminId);
      await importCaptainsAs(admin(adminId), id, { text: sheet });
      const directorId = await seedVeteran("direccion-games@example.com");
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, {
          editionId,
          termId,
          personId: directorId,
          roleCode: "THE_GAMES",
        }),
      );
      expect((await competitionRoles(member(directorId), id)).operator).toBe(true);
      await expect(importCaptainsAs(member(directorId), id, { text: sheet })).rejects.toThrow(
        t("T-3033"),
      );
      await expect(setCaptainsVisibilityAs(member(directorId), id, true)).rejects.toThrow(
        t("T-3033"),
      );
      await expect(clearCaptainsAs(member(directorId), id)).rejects.toThrow(t("T-3033"));
      expect(await listCaptains(id)).toHaveLength(3);
      expect((await getCompetition(id))?.showCaptains).toBe(false);
    });

    it("la vitrina lleva los nombres solo publicada y nunca el celular; archivar los borra", async () => {
      const { id, adminId } = await seedCompetition();
      await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 1, plannedMinutes: 20 });
      await setCompetitionStatusAs(admin(adminId), id, "LIVE");
      await importCaptainsAs(admin(adminId), id, { text: sheet });

      clearShowcaseMemo();
      const hidden = await getShowcase("the-games-2026");
      expect(hidden?.captains).toEqual([]);
      expect(JSON.stringify(hidden)).not.toContain("Ensayo");

      await setCaptainsVisibilityAs(admin(adminId), id, true);
      clearShowcaseMemo();
      const shown = await getShowcase("the-games-2026");
      expect(shown?.captains).toEqual([
        { number: 1, names: ["Ana de Ensayo", "Luis de Ensayo"] },
        { number: 30, names: ["Sara de Ensayo"] },
      ]);
      expect(JSON.stringify(shown)).not.toMatch(/30000000\d\d/);

      await setCompetitionStatusAs(admin(adminId), id, "ARCHIVED");
      expect(await listCaptains(id)).toEqual([]);
      expect((await getCompetition(id))?.showCaptains).toBe(false);
      clearShowcaseMemo();
      expect((await getShowcase("the-games-2026"))?.captains).toEqual([]);
      const [purge] = await getDb()
        .select({ after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.action, "competition.captains.clear"));
      expect(purge?.after).toEqual({ captains: 3, showCaptains: false, reason: "ARCHIVED" });
    });
  });

  describe("tabla oculta (ADR-107)", () => {
    it("la Dirección oculta la tabla: la vitrina no trae posiciones pero sí los equipos, y queda auditado", async () => {
      const { id, editionId, termId, adminId } = await seedCompetition();
      await seedField(id, adminId);
      await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 1, plannedMinutes: 20 });
      await setCompetitionStatusAs(admin(adminId), id, "LIVE");
      const directorId = await seedVeteran("direccion-tabla@example.com");
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, {
          editionId,
          termId,
          personId: directorId,
          roleCode: "THE_GAMES",
        }),
      );
      clearShowcaseMemo();
      const shown = await getShowcase("the-games-2026");
      expect(shown?.standingsHidden).toBe(false);
      expect(shown?.standings.overall.length).toBeGreaterThan(0);

      await setStandingsVisibilityAs(member(directorId), id, false);
      expect((await getCompetition(id))?.showStandings).toBe(false);
      clearShowcaseMemo();
      const hidden = await getShowcase("the-games-2026");
      expect(hidden?.standingsHidden).toBe(true);
      expect(hidden?.standings).toEqual({ overall: [], day1: [], day2: [] });
      expect(hidden?.teams.length).toBe(shown?.standings.overall.length);

      await setStandingsVisibilityAs(member(directorId), id, true);
      clearShowcaseMemo();
      expect((await getShowcase("the-games-2026"))?.standingsHidden).toBe(false);

      // En el orden en que se auditaron: sin `order by` la base las devuelve en el orden físico de la
      // tabla, que no es una garantía.
      const rows = await getDb()
        .select({ after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.action, "competition.standings.visibility"))
        .orderBy(asc(auditLog.at));
      expect(rows.map((row) => row.after)).toEqual([
        { showStandings: false },
        { showStandings: true },
      ]);
    });
  });
});
