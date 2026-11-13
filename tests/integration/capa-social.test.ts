import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import {
  adjustPointsAs,
  claimRewardAs,
  giveApplauseAs,
  listActiveGoals,
  listApplauseReceived,
  listCommitteeApplause,
  listRewardsFor,
  myLeague,
} from "@/modules/participation";
import { deleteApplauseFor } from "@/modules/participation/domain/applause";
import {
  createGoal,
  createReward,
  listRewardClaims,
  markRewardDelivered,
} from "@/modules/participation/domain/goals";
import { closeLeagueWeek } from "@/modules/participation/domain/leagues";
import { setSocialVisibleAs } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

// La capa social (ADR-175 a ADR-178): aplausos con su tope y su comité, el muro que respeta la
// actividad apagada, las metas colectivas, las recompensas por umbral y las ligas semanales.

const actor = (personId: string) => ({ personId, ip: null });

beforeEach(truncateAll);
afterAll(() => closeDb());

async function committeePair() {
  const termId = await seedTerm();
  const committeeId = await seedCommittee("social-comite", "Comité Social");
  const ana = await seedMember("ana.social@eafit.edu.co");
  const beto = await seedMember("beto.social@eafit.edu.co");
  await seedCommitteeMembership(ana, committeeId, termId);
  await seedCommitteeMembership(beto, committeeId, termId);
  return { termId, committeeId, ana, beto };
}

describe("aplausos y muro (ADR-176)", () => {
  it("quien recibe siempre lo ve; el muro solo si los dos tienen la actividad prendida", async () => {
    const { termId, committeeId, ana, beto } = await committeePair();

    await giveApplauseAs(actor(ana), {
      toPersonId: beto,
      committeeId,
      message: "Gracias por ayer",
    });

    expect((await listApplauseReceived(beto)).map((item) => item.message)).toEqual([
      "Gracias por ayer",
    ]);
    expect(await listCommitteeApplause(committeeId, termId)).toEqual([]);

    await setSocialVisibleAs(actor(ana), true);
    await setSocialVisibleAs(actor(beto), true);
    expect(await listCommitteeApplause(committeeId, termId)).toHaveLength(1);

    // Apagarla lo esconde desde ya, también lo que ya había salido (ADR-175 regla 4).
    await setSocialVisibleAs(actor(ana), false);
    expect(await listCommitteeApplause(committeeId, termId)).toEqual([]);
  });

  it("no se aplaude a sí misma ni a alguien de otro comité, y hay tope de cinco al día", async () => {
    const { committeeId, ana, beto } = await committeePair();
    const outsider = await seedMember("otra.social@eafit.edu.co");

    await expect(
      giveApplauseAs(actor(ana), { toPersonId: ana, committeeId, message: "Yo misma" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      giveApplauseAs(actor(ana), { toPersonId: outsider, committeeId, message: "Hola" }),
    ).rejects.toBeInstanceOf(DomainError);
    for (let index = 0; index < 5; index += 1) {
      await giveApplauseAs(actor(ana), {
        toPersonId: beto,
        committeeId,
        message: `Gracias ${index}`,
      });
    }
    await expect(
      giveApplauseAs(actor(ana), { toPersonId: beto, committeeId, message: "Una más" }),
    ).rejects.toThrow(t("T-4970", { n: 5 }));
  });

  it("al anonimizar se borran los aplausos que dio y recibió", async () => {
    const { committeeId, ana, beto } = await committeePair();
    await giveApplauseAs(actor(ana), { toPersonId: beto, committeeId, message: "Bien" });
    await giveApplauseAs(actor(beto), { toPersonId: ana, committeeId, message: "Igual" });

    expect(await deleteApplauseFor(ana)).toBe(2);
  });
});

describe("metas colectivas y recompensas (ADR-177)", () => {
  it("una meta de asistencias suma las aprobadas del rango y se cumple", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.meta@eafit.edu.co");
    const beto = await seedMember("beto.meta@eafit.edu.co");
    const { id } = await seedOccasion(termId, { title: "Asamblea de la meta" });
    await seedCheckIn(id, ana, "APPROVED");
    await seedCheckIn(id, beto, "APPROVED");
    const today = new Date().toISOString().slice(0, 10);
    await runCommand(actor(ana), (ctx) =>
      createGoal(ctx, {
        title: "Dos asistencias",
        metric: "CHECKINS",
        target: 2,
        startsOn: "2020-01-01",
        endsOn: "2099-12-31",
      }),
    );

    const [goal] = await listActiveGoals([], today);

    expect(goal).toMatchObject({ title: "Dos asistencias", progress: 2, done: true });
  });

  it("una meta de un comité solo cuenta asistencias", async () => {
    const committeeId = await seedCommittee("meta-comite", "Comité de la meta");
    const ana = await seedMember("ana.comite@eafit.edu.co");

    await expect(
      runCommand(actor(ana), (ctx) =>
        createGoal(ctx, {
          title: "Retos del comité",
          metric: "CHALLENGES",
          target: 5,
          committeeId,
          startsOn: "2020-01-01",
          endsOn: "2099-12-31",
        }),
      ),
    ).rejects.toThrow(t("T-4991"));
  });

  it("reclamar exige el saldo, va una sola vez y no toca los puntos; ADMIN la marca entregada", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.recompensa@eafit.edu.co");
    const { id: rewardId } = await runCommand(actor(ana), (ctx) =>
      createReward(ctx, { termId, points: 10, title: "Camiseta de la OE" }),
    );

    await expect(claimRewardAs(actor(ana), rewardId)).rejects.toThrow(t("T-4980"));
    await adjustPointsAs(actor(ana), { personId: ana, termId, points: 10, reason: "Sintético" });
    await claimRewardAs(actor(ana), rewardId);
    await expect(claimRewardAs(actor(ana), rewardId)).rejects.toThrow(t("T-4981"));

    const [claim] = (await listRewardClaims({ pending: true, page: 1, pageSize: 10 })).rows;
    if (!claim) throw new Error("no quedó la entrega");
    await runCommand(actor(ana), (ctx) => markRewardDelivered(ctx, claim.id));
    expect((await listRewardsFor(ana, termId))[0]?.deliveredAt).toBeInstanceOf(Date);
  });
});

describe("ligas semanales (ADR-178)", () => {
  it("con la actividad apagada no entra; prendida empieza en Bronce y sube al cerrar la semana", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.liga@eafit.edu.co");
    const beto = await seedMember("beto.liga@eafit.edu.co");

    expect(await myLeague(ana)).toBeNull();

    await setSocialVisibleAs(actor(ana), true);
    await setSocialVisibleAs(actor(beto), true);
    await adjustPointsAs(actor(ana), { personId: ana, termId, points: 15, reason: "Sintético" });
    const now = new Date();
    // Entra a la liga quien la abre: Beto primero, para que salga en la tabla de Ana.
    await myLeague(beto, now);
    const league = await myLeague(ana, now);
    expect(league).toMatchObject({ tier: "BRONCE", myPoints: 15 });
    expect(league?.table.map((row) => row.points)).toEqual([15, 0]);

    const nextWeek = new Date(now.getTime() + 7 * 86_400_000);
    expect(await closeLeagueWeek(nextWeek)).toEqual({ moved: 2 });
    // Es idempotente: volver a cerrar no cambia nada.
    expect(await closeLeagueWeek(nextWeek)).toEqual({ moved: 0 });
    expect(await myLeague(ana, nextWeek)).toMatchObject({ tier: "PLATA", promoted: true });
    expect(await myLeague(beto, nextWeek)).toMatchObject({ tier: "BRONCE", promoted: false });
  });
});
