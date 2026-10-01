import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  assignStaffAs,
  type CompetitionActor,
  clearRouteMemo,
  clearShowcaseMemo,
  createCompetitionAs,
  createTeamAs,
  declarePowerAs,
  deliverPowerGrantsAs,
  enterHubAs,
  generateDayScheduleAs,
  getHubState,
  getShowcase,
  getTeamRoute,
  importPowerGrantsAs,
  issueTeamCodesAs,
  listPowerBoard,
  listStandings,
  recordResultAs,
  revertPowerUseAs,
  saveBaseAs,
  saveRotationMatchupsAs,
  setCompetitionStatusAs,
  startMatchupAs,
  startRotationAs,
  updateCompetitionSettingsAs,
  voidPowerGrantAs,
} from "@/modules/competition";
import { clearHubFailures } from "@/modules/competition/domain/hub";
import { HUB_TERMS_VERSION } from "@/modules/competition/domain/hub-pure";
import {
  competitionBase,
  competitionMatchup,
  competitionPointEntry,
  competitionPowerGrant,
  competitionPowerUse,
  competitionResult,
  competitionRotation,
} from "@/modules/competition/schema";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Poderes de The Games (ADR-098): reparto y entrega por la operación, declaración del líder antes de
// empezar la base, resultado oficial en el mismo libro sin crédito doble, reversión con recálculo,
// guardas, concurrencia y datos públicos sin ids.

const admin = (personId: string): CompetitionActor => ({ personId, isAdmin: true, ip: "10.0.0.1" });
const member = (personId: string): CompetitionActor => ({
  personId,
  isAdmin: false,
  ip: "10.0.0.2",
});

async function seedEdition(): Promise<string> {
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
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return edicion.id;
}

/** Seis equipos, tres bases el jueves (la tercera inflable) y la jornada 1 generada. En la rotación 1:
 *  1 contra 6 en la base 1, 3 contra 4 en la base 2 y 2 contra 5 en la inflable. */
async function seedPowers() {
  const adminId = await seedMember("admin-poderes@example.com");
  const actor = admin(adminId);
  const { id } = await createCompetitionAs(actor, {
    editionId: await seedEdition(),
    slug: "the-games-2026",
    name: "The Games 2026",
  });
  const teams: string[] = [];
  for (let n = 1; n <= 6; n++) {
    teams.push((await createTeamAs(actor, id, { number: n, name: `Equipo ${n}` })).id);
  }
  const bases: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { id: baseId } = await saveBaseAs(actor, id, null, {
      day: 1,
      orderIndex: i,
      name: `Base ${i + 1}`,
      kind: i === 2 ? "MACRO" : "NORMAL",
    });
    bases.push(baseId);
  }
  await generateDayScheduleAs(actor, id, { day: 1, rotations: 3, plannedMinutes: 20 });
  const rotations = await getDb()
    .select()
    .from(competitionRotation)
    .where(eq(competitionRotation.competitionId, id))
    .orderBy(asc(competitionRotation.number));
  const [first, second] = rotations;
  if (!first || !second) throw new Error("sin rotaciones");
  const matchupAt = async (rotationId: string, baseId: string) => {
    const [row] = await getDb()
      .select()
      .from(competitionMatchup)
      .where(
        and(eq(competitionMatchup.rotationId, rotationId), eq(competitionMatchup.baseId, baseId)),
      );
    if (!row) throw new Error("sin enfrentamiento");
    return row;
  };
  const team = (n: number) => teams[n - 1] ?? "";
  // Impares: 3 el jueves y 2 el viernes; pares: 2 y 3. Los tipos se repiten entre equipos.
  const sheet = [1, 2, 3, 4, 5, 6]
    .flatMap((n) => [
      `${n}\tMultiplicador x2\tjueves`,
      `${n}\tCambio de resultados\tjueves`,
      n % 2 === 1 ? `${n}\tCancelar poder\tjueves` : `${n}\tx2\tviernes`,
      `${n}\t1 min tarde\tviernes`,
      `${n}\tUn jugador menos\tviernes`,
    ])
    .join("\n");
  return { id, actor, adminId, team, bases, first, second, matchupAt, sheet };
}

async function activeUses(rotationId: string) {
  return getDb()
    .select()
    .from(competitionPowerUse)
    .where(
      and(eq(competitionPowerUse.rotationId, rotationId), eq(competitionPowerUse.status, "ACTIVE")),
    );
}

async function pointsOf(competitionId: string, teamId: string) {
  const standings = await listStandings(competitionId);
  return standings.overall.find((row) => row.teamId === teamId);
}

describe("poderes de The Games (ADR-098)", () => {
  beforeEach(async () => {
    await truncateAll();
    clearShowcaseMemo();
    clearRouteMemo();
    clearHubFailures();
  });
  afterAll(() => closeDb());

  it("el reparto se pega todo o nada, lo hace la operación, y entregar dos veces no cambia nada", async () => {
    const { id, actor, sheet, bases } = await seedPowers();
    const judgeId = await seedMember("juez-poderes@example.com");
    await assignStaffAs(actor, id, { personId: judgeId, role: "JUDGE", baseId: bases[0] });
    await expect(
      importPowerGrantsAs(member(judgeId), id, { text: "1\tx2\tjueves" }),
    ).rejects.toThrow(t("T-2764"));

    const bad = await importPowerGrantsAs(actor, id, { text: "1\tx2\tjueves\n7\tx2\tjueves" });
    expect(bad).toEqual({
      saved: false,
      errors: [t("T-3024", { linea: 2, equipo: "7" })],
      grants: 0,
      teams: 0,
    });
    expect(await getDb().select().from(competitionPowerGrant)).toHaveLength(0);

    expect(await importPowerGrantsAs(actor, id, { text: sheet })).toEqual({
      saved: true,
      errors: [],
      grants: 30,
      teams: 6,
    });
    const sixth = await importPowerGrantsAs(actor, id, { text: "1\tx2\tviernes" });
    expect(sixth.errors).toEqual([t("T-3073", { equipo: "1 Equipo 1" })]);

    expect(await deliverPowerGrantsAs(actor, id, { day: 1 })).toEqual({ delivered: 15 });
    expect(await deliverPowerGrantsAs(actor, id, { day: 1 })).toEqual({ delivered: 0 });
    const board = await listPowerBoard(id);
    expect(board.totals).toEqual({ grants: 30, delivered: 15, completeTeams: 6, teams: 6 });
    expect(board.teams.map((team) => [team.dayOne, team.dayTwo])).toEqual([
      [3, 2],
      [2, 3],
      [3, 2],
      [2, 3],
      [3, 2],
      [2, 3],
    ]);

    const audits = await getDb()
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(inArray(auditLog.action, ["competition.power.import", "competition.power.deliver"]));
    expect(audits.map((row) => row.action).sort()).toEqual([
      "competition.power.deliver",
      "competition.power.import",
    ]);
    expect(audits.every((row) => row.actorId === actor.personId)).toBe(true);
  });

  it("el líder registra la tarjeta antes de empezar y el servidor rechaza lo que no vale", async () => {
    const { id, actor, team, bases, first, second, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    // El equipo 6 todavía no recibió sus tarjetas del jueves.
    for (const n of [1, 2, 3, 4, 5]) {
      await deliverPowerGrantsAs(actor, id, { day: 1, teamId: team(n) });
    }
    const judgeId = await seedMember("juez-base-1@example.com");
    await assignStaffAs(actor, id, { personId: judgeId, role: "JUDGE", baseId: bases[0] });
    const judge = member(judgeId);
    const m = await matchupAt(first.id, bases[0] ?? "");
    const inflatable = await matchupAt(first.id, bases[2] ?? "");
    const declare = (who: CompetitionActor, matchupId: string, teamId: string, power: string) =>
      declarePowerAs(who, id, {
        matchupId,
        teamId,
        power: power as "DOUBLE_POINTS",
      });

    // Con la rotación pendiente nadie registra.
    await expect(declare(actor, m.id, team(1), "DOUBLE_POINTS")).rejects.toThrow(t("T-3051"));
    await startRotationAs(actor, id, first.id);

    const declared = await declare(judge, m.id, team(1), "DOUBLE_POINTS");
    expect(declared.changed).toBe(true);
    expect(await declare(judge, m.id, team(1), "DOUBLE_POINTS")).toEqual({
      changed: false,
      useId: declared.useId,
    });
    await expect(declare(judge, m.id, team(1), "RESULT_SWAP")).rejects.toThrow(
      t("T-3052", { equipo: "Equipo 1", poder: "Multiplicador x2" }),
    );
    // El equipo 6 tiene su x2 del jueves asignado pero sin entregar; un equipo de otra base no es de
    // este enfrentamiento.
    await expect(declare(judge, m.id, team(6), "DOUBLE_POINTS")).rejects.toThrow(
      t("T-3053", { equipo: "Equipo 6" }),
    );
    await expect(declare(judge, m.id, team(3), "DOUBLE_POINTS")).rejects.toThrow(t("T-2764"));
    // Las tarjetas del viernes no sirven el jueves, aunque estén entregadas.
    await deliverPowerGrantsAs(actor, id, { day: 2, teamId: team(6) });
    await expect(declare(actor, m.id, team(6), "LATE_START")).rejects.toThrow(
      t("T-3053", { equipo: "Equipo 6" }),
    );
    // El líder de la base 1 no registra en otra base, y en la inflable no hay poderes.
    await expect(declare(judge, inflatable.id, team(2), "DOUBLE_POINTS")).rejects.toThrow(
      t("T-2764"),
    );
    await expect(declare(actor, inflatable.id, team(2), "DOUBLE_POINTS")).rejects.toThrow(
      t("T-3049"),
    );
    // La rotación 2 sigue pendiente.
    const next = await matchupAt(second.id, bases[0] ?? "");
    await expect(declare(actor, next.id, next.teamAId, "RESULT_SWAP")).rejects.toThrow(t("T-3051"));

    expect(await startMatchupAs(judge, id, m.id)).toEqual({ changed: true });
    const [started] = await getDb()
      .select({ startedAt: competitionMatchup.startedAt })
      .from(competitionMatchup)
      .where(eq(competitionMatchup.id, m.id));
    expect(await startMatchupAs(judge, id, m.id)).toEqual({ changed: false });
    const [again] = await getDb()
      .select({ startedAt: competitionMatchup.startedAt })
      .from(competitionMatchup)
      .where(eq(competitionMatchup.id, m.id));
    expect(again?.startedAt).toEqual(started?.startedAt);
    await expect(declare(actor, m.id, team(6), "CANCEL_POWER")).rejects.toThrow(t("T-3050"));
    // Un reintento del mismo pedido después de empezar no falla ni registra otro.
    expect((await declare(judge, m.id, team(1), "DOUBLE_POINTS")).changed).toBe(false);
    expect(await activeUses(first.id)).toHaveLength(1);
  });

  it("x2 ganado suma 2000 una sola vez; repetir y corregir el resultado no acreditan doble", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");
    await declarePowerAs(actor, id, { matchupId: m.id, teamId: team(1), power: "DOUBLE_POINTS" });

    await recordResultAs(actor, id, { matchupId: m.id, outcome: "A_WIN" });
    expect((await pointsOf(id, team(1)))?.points).toBe(2000);
    expect((await pointsOf(id, team(6)))?.points).toBe(0);
    const [current] = await getDb()
      .select()
      .from(competitionResult)
      .where(eq(competitionResult.matchupId, m.id));
    expect(current?.outcome).toBe("A_WIN");
    expect(current?.officialOutcome).toBe("A_WIN");
    expect(current?.powerDetail?.teams.A).toEqual({ base: 1000, bonus: 1000, total: 2000 });

    expect((await recordResultAs(actor, id, { matchupId: m.id, outcome: "A_WIN" })).changed).toBe(
      false,
    );
    expect((await pointsOf(id, team(1)))?.points).toBe(2000);
    await recordResultAs(actor, id, { matchupId: m.id, outcome: "B_WIN" });
    expect((await pointsOf(id, team(1)))?.points).toBe(0);
    expect((await pointsOf(id, team(6)))?.points).toBe(1000);
    await recordResultAs(actor, id, { matchupId: m.id, outcome: "A_WIN" });
    expect((await pointsOf(id, team(1)))?.points).toBe(2000);
    const entries = await getDb()
      .select()
      .from(competitionPointEntry)
      .where(eq(competitionPointEntry.teamId, team(1)));
    expect(entries.map((entry) => [entry.kind, entry.points])).toEqual(
      expect.arrayContaining([
        ["MATCH", 2000],
        ["REVERSAL", -2000],
      ]),
    );
    expect(entries.find((entry) => entry.kind === "MATCH")?.reason).toBe(
      t("T-3061", { poderes: "Multiplicador x2" }),
    );
  });

  it("Cambio de resultados invierte la tabla y la vitrina, y conserva el resultado de la cancha", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    await setCompetitionStatusAs(actor, id, "LIVE");
    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");
    await declarePowerAs(actor, id, { matchupId: m.id, teamId: team(1), power: "RESULT_SWAP" });
    await recordResultAs(actor, id, { matchupId: m.id, outcome: "B_WIN" });

    const [result] = await getDb()
      .select()
      .from(competitionResult)
      .where(eq(competitionResult.matchupId, m.id));
    expect(result?.outcome).toBe("B_WIN");
    expect(result?.officialOutcome).toBe("A_WIN");
    expect(await pointsOf(id, team(1))).toMatchObject({ points: 1000, wins: 1, losses: 0 });
    expect(await pointsOf(id, team(6))).toMatchObject({ points: 0, wins: 0, losses: 1 });

    const showcase = await getShowcase("the-games-2026");
    const shown = showcase?.currentRotation?.matchups.find((item) => item.base.name === "Base 1");
    expect(shown?.outcome).toBe("A_WIN");
    const route = await getTeamRoute("the-games-2026", 1);
    expect(route?.stops[0]).toMatchObject({ result: "WIN", points: 1000 });
    expect(JSON.stringify(showcase)).not.toMatch(/useId|grantId/);
  });

  it("revertir después del resultado lo vuelve a calcular con motivo; antes de empezar lo quita el líder", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    const judgeId = await seedMember("juez-revertir@example.com");
    await assignStaffAs(actor, id, { personId: judgeId, role: "JUDGE", baseId: bases[0] });
    const judge = member(judgeId);
    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");

    const wrong = await declarePowerAs(judge, id, {
      matchupId: m.id,
      teamId: team(1),
      power: "RESULT_SWAP",
    });
    expect(await revertPowerUseAs(judge, id, { useId: wrong.useId })).toEqual({
      changed: true,
      rescored: false,
    });
    const [removed] = await getDb()
      .select()
      .from(competitionPowerUse)
      .where(eq(competitionPowerUse.id, wrong.useId));
    expect(removed).toMatchObject({ status: "REVERTED", revertReason: t("T-3063") });

    const right = await declarePowerAs(judge, id, {
      matchupId: m.id,
      teamId: team(1),
      power: "DOUBLE_POINTS",
    });
    await recordResultAs(judge, id, { matchupId: m.id, outcome: "A_WIN" });
    expect((await pointsOf(id, team(1)))?.points).toBe(2000);

    await expect(revertPowerUseAs(judge, id, { useId: right.useId })).rejects.toThrow(t("T-3056"));
    await expect(revertPowerUseAs(actor, id, { useId: right.useId })).rejects.toThrow(t("T-3057"));
    expect(
      await revertPowerUseAs(actor, id, { useId: right.useId, reason: "Tarjeta equivocada" }),
    ).toEqual({ changed: true, rescored: true });
    expect(
      await revertPowerUseAs(actor, id, { useId: right.useId, reason: "Tarjeta equivocada" }),
    ).toEqual({ changed: false, rescored: false });
    expect((await pointsOf(id, team(1)))?.points).toBe(1000);
    const reversal = await getDb()
      .select()
      .from(competitionPointEntry)
      .where(
        and(eq(competitionPointEntry.teamId, team(1)), eq(competitionPointEntry.kind, "REVERSAL")),
      );
    expect(reversal.map((entry) => [entry.points, entry.reason])).toEqual([
      [-2000, t("T-3062", { motivo: "Tarjeta equivocada" })],
    ]);
    const audits = await getDb()
      .select({ action: auditLog.action, actorId: auditLog.actorId, after: auditLog.after })
      .from(auditLog)
      .where(inArray(auditLog.action, ["competition.power.revert", "competition.result.rescore"]));
    expect(audits.map((row) => row.action).sort()).toEqual([
      "competition.power.revert",
      "competition.power.revert",
      "competition.result.rescore",
    ]);
    expect(audits.filter((row) => row.actorId === actor.personId)).toHaveLength(2);

    // Una tarjeta usada no se anula; revertida, sí.
    const [grant] = await getDb()
      .select()
      .from(competitionPowerGrant)
      .where(
        and(
          eq(competitionPowerGrant.teamId, team(1)),
          eq(competitionPowerGrant.power, "CANCEL_POWER"),
        ),
      );
    expect(
      await voidPowerGrantAs(actor, id, { grantId: grant?.id ?? "", reason: "Mal repartida" }),
    ).toEqual({ changed: true });
  });

  it("no se editan los cruces de una rotación con poderes, ni una base con poderes pasa a inflable", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");
    await declarePowerAs(actor, id, { matchupId: m.id, teamId: team(1), power: "DOUBLE_POINTS" });
    const matchups = await getDb()
      .select()
      .from(competitionMatchup)
      .where(eq(competitionMatchup.rotationId, first.id));
    await expect(
      saveRotationMatchupsAs(actor, id, first.id, {
        matchups: matchups.map(({ baseId, teamAId, teamBId }) => ({ baseId, teamAId, teamBId })),
      }),
    ).rejects.toThrow(t("T-3058"));
    const [base] = await getDb()
      .select()
      .from(competitionBase)
      .where(eq(competitionBase.id, bases[0] ?? ""));
    await expect(
      saveBaseAs(actor, id, bases[0] ?? "", {
        day: 1,
        orderIndex: base?.orderIndex ?? 0,
        name: base?.name ?? "",
        kind: "MACRO",
      }),
    ).rejects.toThrow(t("T-3059"));
  });

  it("dos pedidos a la vez dejan un solo uso por equipo, y nada se registra después de empezar", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    const judgeId = await seedMember("juez-concurrencia@example.com");
    await assignStaffAs(actor, id, { personId: judgeId, role: "JUDGE", baseId: bases[0] });
    const judge = member(judgeId);
    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");

    const same = await Promise.allSettled([
      declarePowerAs(judge, id, { matchupId: m.id, teamId: team(1), power: "DOUBLE_POINTS" }),
      declarePowerAs(actor, id, { matchupId: m.id, teamId: team(1), power: "DOUBLE_POINTS" }),
    ]);
    expect(same.every((item) => item.status === "fulfilled")).toBe(true);
    const different = await Promise.allSettled([
      declarePowerAs(judge, id, { matchupId: m.id, teamId: team(6), power: "DOUBLE_POINTS" }),
      declarePowerAs(actor, id, { matchupId: m.id, teamId: team(6), power: "RESULT_SWAP" }),
    ]);
    expect(different.filter((item) => item.status === "rejected")).toHaveLength(1);
    const uses = await activeUses(first.id);
    expect(uses.filter((use) => use.teamId === team(1))).toHaveLength(1);
    expect(uses.filter((use) => use.teamId === team(6))).toHaveLength(1);

    const other = await matchupAt(first.id, bases[1] ?? "");
    await Promise.allSettled([
      startMatchupAs(actor, id, other.id),
      declarePowerAs(actor, id, { matchupId: other.id, teamId: team(3), power: "DOUBLE_POINTS" }),
    ]);
    const [row] = await getDb()
      .select({ startedAt: competitionMatchup.startedAt })
      .from(competitionMatchup)
      .where(eq(competitionMatchup.id, other.id));
    const startedAt = row?.startedAt?.getTime() ?? 0;
    for (const use of (await activeUses(first.id)).filter((item) => item.teamId === team(3))) {
      expect(use.createdAt.getTime()).toBeLessThanOrEqual(startedAt);
    }
  });

  it("el hub muestra las tarjetas del equipo, con su estado y su efecto, sin ids", async () => {
    const { id, actor, team, bases, first, matchupAt, sheet } = await seedPowers();
    await importPowerGrantsAs(actor, id, { text: sheet });
    await deliverPowerGrantsAs(actor, id, { day: 1 });
    await updateCompetitionSettingsAs(actor, id, {
      name: "The Games 2026",
      bettingEnabled: true,
      startingCredits: 1000,
    });
    await setCompetitionStatusAs(actor, id, "LIVE");
    const codes = await issueTeamCodesAs(actor, id, false);
    const code = codes.find((item) => item.teamId === team(1))?.code ?? "";
    const entered = await enterHubAs({ personId: null, ip: "10.9.9.9" }, code, HUB_TERMS_VERSION);
    if (!entered.ok) throw new Error(entered.message);

    await startRotationAs(actor, id, first.id);
    const m = await matchupAt(first.id, bases[0] ?? "");
    await declarePowerAs(actor, id, { matchupId: m.id, teamId: team(1), power: "DOUBLE_POINTS" });
    const before = await getHubState(entered.session);
    expect(before?.powers).toHaveLength(5);
    expect(before?.powers[0]).toMatchObject({
      power: "DOUBLE_POINTS",
      day: 1,
      status: "USED",
      use: { rotation: 1, base: "Base 1", rival: { number: 6 }, effect: "PENDING" },
    });
    expect(before?.powers.filter((power) => power.day === 2).map((power) => power.status)).toEqual([
      "ASSIGNED",
      "ASSIGNED",
    ]);

    await recordResultAs(actor, id, { matchupId: m.id, outcome: "A_WIN" });
    const after = await getHubState(entered.session);
    expect(after?.powers[0]?.use?.effect).toBe("APPLIED");
    expect(after?.route[0]).toMatchObject({ result: "WIN", points: 2000 });
    const grants = await getDb()
      .select({ id: competitionPowerGrant.id })
      .from(competitionPowerGrant);
    const json = JSON.stringify(after);
    for (const grant of grants) expect(json).not.toContain(grant.id);
    expect(json).not.toContain(team(1));
  });
});
