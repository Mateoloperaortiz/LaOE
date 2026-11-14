import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { adjustPointsAs, balanceFor } from "@/modules/participation";
import { checkIn, pointEntry } from "@/modules/participation/schema";
import {
  cancelMarketAs,
  createMarketAs,
  getMatchCap,
  myPredictions,
  openMarketAs,
  placePredictionAs,
  setMatchCapAs,
} from "@/modules/predictions";
import { resolveMarket } from "@/modules/predictions/domain/predictions";
import { predictionOption, predictionTicket } from "@/modules/predictions/schema";
import { t, tList } from "@/shared/copy";
import {
  seedAppointment,
  seedCheckIn,
  seedMember,
  seedOccasion,
  seedTerm,
  seedWorkGroup,
} from "../factories";
import { truncateAll } from "./db";

// Los pronósticos del Athletic (ADR-197 regla 7 y su precisión): los maneja quien lidera el Athletic;
// el tope lo fija Gestión Humana; pronostica quien registró su asistencia, hasta que el partido
// empieza, con sus GH Points; se paga por bolsa, y el parley tiene su propia bolsa.

const guard = (index: number) => tList("T-5149")[index] ?? "";
const HOUR = 3_600_000;

async function setup() {
  const termId = await seedTerm();
  const leaderId = await seedMember("lider.athletic@eafit.edu.co");
  await seedWorkGroup(termId, "Athletic", {
    kind: "WORK_COMMITTEE",
    code: "ATHLETIC",
    leaderPersonId: leaderId,
  });
  const ghId = await seedMember("vp.gh.pronosticos@eafit.edu.co");
  await seedAppointment(ghId, termId, "VP_GH");
  const match = await seedOccasion(termId, {
    title: "Final de fútbol",
    category: "ATHLETIC_MATCH",
    startsAt: new Date(Date.now() + 2 * HOUR),
  });
  const people = await Promise.all(
    ["ana", "beto", "caro", "dani"].map(async (name) => {
      const id = await seedMember(`${name}.pronostico@eafit.edu.co`);
      await giveGh(id, termId, 50);
      await seedCheckIn(match.id, id, "PENDING");
      return { id, actor: { personId: id, ip: null } };
    }),
  );
  return {
    termId,
    match: match.id,
    leader: { personId: leaderId, ip: null },
    gh: { personId: ghId, ip: null },
    people,
  };
}

async function marketWithOptions(f: Awaited<ReturnType<typeof setup>>, title: string) {
  const { id } = await createMarketAs(f.leader, {
    occasionId: f.match,
    title,
    options: ["Gana la OE", "Empate", "Pierde la OE"],
  });
  const options = await getDb()
    .select()
    .from(predictionOption)
    .where(eq(predictionOption.marketId, id))
    .orderBy(predictionOption.sortOrder);
  return { id, options: options.map((option) => option.id) };
}

/** Saldo GH para apostar, por el libro, como un ajuste de Gestión Humana. */
async function giveGh(personId: string, termId: string, points: number) {
  const gh = await seedMember(`ajuste.${personId}@eafit.edu.co`);
  await adjustPointsAs(
    { personId: gh, ip: null },
    { personId, termId, points, reason: "Saldo sintético" },
  );
}

/** El partido ya empezó: resolver se hace después del inicio. */
async function resolveAfterKickoff(leaderId: string, marketId: string, optionId: string) {
  await runCommand({ personId: leaderId, ip: null }, (ctx) =>
    resolveMarket(ctx, marketId, optionId, new Date(Date.now() + 3 * HOUR)),
  );
}

describe("quién maneja los pronósticos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el tope lo fija Gestión Humana, y sin tope no se abre ningún pronóstico", async () => {
    const f = await setup();
    const market = await marketWithOptions(f, "Resultado");

    await expect(openMarketAs(f.leader, market.id)).rejects.toThrow(guard(6));
    await expect(setMatchCapAs(f.leader, 20)).rejects.toThrow(guard(2));
    await setMatchCapAs(f.gh, 20);
    expect(await getMatchCap()).toBe(20);
    await openMarketAs(f.leader, market.id);
  });

  it("solo quien lidera el Athletic crea pronósticos, y solo de partidos del Athletic", async () => {
    const f = await setup();
    await expect(
      createMarketAs(f.gh, { occasionId: f.match, title: "Resultado", options: ["Sí", "No"] }),
    ).rejects.toThrow(guard(0));
    const otra = await seedOccasion(f.termId, { startsAt: new Date(Date.now() + HOUR) });
    await expect(
      createMarketAs(f.leader, { occasionId: otra.id, title: "Resultado", options: ["Sí", "No"] }),
    ).rejects.toThrow(guard(1));
    await expect(
      createMarketAs(f.leader, { occasionId: f.match, title: "Resultado", options: ["Sí", "Sí"] }),
    ).rejects.toThrow(guard(4));
  });
});

describe("pronosticar", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("descuenta lo apostado de los GH Points, dentro del tope y del saldo, y solo con asistencia", async () => {
    const f = await setup();
    await setMatchCapAs(f.gh, 20);
    const market = await marketWithOptions(f, "Resultado");
    await openMarketAs(f.leader, market.id);
    const [ana] = f.people;
    if (!ana) throw new Error("falta Ana");
    const pick = { marketId: market.id, optionId: market.options[0] ?? "" };

    await placePredictionAs(ana.actor, { occasionId: f.match, stake: 15, picks: [pick] });
    expect(await balanceFor(ana.id, f.termId)).toBe(35);
    await expect(
      placePredictionAs(ana.actor, { occasionId: f.match, stake: 6, picks: [pick] }),
    ).rejects.toThrow(t("T-5153", { n: 5 }));

    const sinAsistencia = await seedMember("sin.asistencia@eafit.edu.co");
    await giveGh(sinAsistencia, f.termId, 50);
    await expect(
      placePredictionAs(
        { personId: sinAsistencia, ip: null },
        { occasionId: f.match, stake: 5, picks: [pick] },
      ),
    ).rejects.toThrow(guard(9));

    const pobre = await seedMember("sin.saldo@eafit.edu.co");
    await giveGh(pobre, f.termId, 3);
    await seedCheckIn(f.match, pobre, "APPROVED");
    await expect(
      placePredictionAs(
        { personId: pobre, ip: null },
        { occasionId: f.match, stake: 5, picks: [pick] },
      ),
    ).rejects.toThrow(guard(12));
  });

  it("reparte la bolsa al registrar el resultado, y devuelve a quien ya no figura como asistente", async () => {
    const f = await setup();
    await setMatchCapAs(f.gh, 30);
    const market = await marketWithOptions(f, "Resultado");
    await openMarketAs(f.leader, market.id);
    const [ana, beto, caro, dani] = f.people;
    if (!ana || !beto || !caro || !dani) throw new Error("faltan personas");
    const [gana, empate] = market.options;
    const bet = (who: typeof ana, optionId: string | undefined, stake: number) =>
      placePredictionAs(who.actor, {
        occasionId: f.match,
        stake,
        picks: [{ marketId: market.id, optionId: optionId ?? "" }],
      });
    await bet(ana, gana, 10);
    await bet(beto, gana, 30);
    await bet(caro, empate, 20);
    await bet(dani, empate, 10);
    // A Dani le anularon la asistencia: no entra a la bolsa y se le devuelve.
    await getDb()
      .update(checkIn)
      .set({ status: "REJECTED" })
      .where(and(eq(checkIn.occasionId, f.match), eq(checkIn.personId, dani.id)));

    await resolveAfterKickoff(f.leader.personId, market.id, gana ?? "");

    expect(await balanceFor(ana.id, f.termId)).toBe(50 - 10 + 15);
    expect(await balanceFor(beto.id, f.termId)).toBe(50 - 30 + 45);
    expect(await balanceFor(caro.id, f.termId)).toBe(30);
    expect(await balanceFor(dani.id, f.termId)).toBe(50);
    const kinds = (
      await getDb()
        .select({ kind: pointEntry.kind })
        .from(pointEntry)
        .where(eq(pointEntry.personId, dani.id))
    ).map((row) => row.kind);
    expect(kinds.sort()).toEqual(["ADJUSTMENT", "PREDICTION_REFUND", "PREDICTION_STAKE"]);
    const mine = await myPredictions(beto.id);
    expect(mine.tickets[0]).toMatchObject({ status: "WON", stake: 30, payout: 45 });
  });

  it("no se pronostica cuando el partido ya empezó ni en un pronóstico cerrado", async () => {
    const f = await setup();
    await setMatchCapAs(f.gh, 30);
    const market = await marketWithOptions(f, "Resultado");
    const [ana] = f.people;
    if (!ana) throw new Error("falta Ana");
    await expect(
      placePredictionAs(ana.actor, {
        occasionId: f.match,
        stake: 5,
        picks: [{ marketId: market.id, optionId: market.options[0] ?? "" }],
      }),
    ).rejects.toThrow(guard(11));
  });
});

describe("el parley", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("tiene su propia bolsa, que se reparte cuando se resuelven todos sus pronósticos", async () => {
    const f = await setup();
    await setMatchCapAs(f.gh, 30);
    const resultado = await marketWithOptions(f, "Resultado");
    const goles = await marketWithOptions(f, "Quién mete el primer gol");
    await openMarketAs(f.leader, resultado.id);
    await openMarketAs(f.leader, goles.id);
    const [ana, beto] = f.people;
    if (!ana || !beto) throw new Error("faltan personas");
    await placePredictionAs(ana.actor, {
      occasionId: f.match,
      stake: 10,
      picks: [
        { marketId: resultado.id, optionId: resultado.options[0] ?? "" },
        { marketId: goles.id, optionId: goles.options[0] ?? "" },
      ],
    });
    await placePredictionAs(beto.actor, {
      occasionId: f.match,
      stake: 20,
      picks: [
        { marketId: resultado.id, optionId: resultado.options[0] ?? "" },
        { marketId: goles.id, optionId: goles.options[1] ?? "" },
      ],
    });
    await expect(
      placePredictionAs(ana.actor, {
        occasionId: f.match,
        stake: 1,
        picks: [
          { marketId: resultado.id, optionId: resultado.options[0] ?? "" },
          { marketId: resultado.id, optionId: resultado.options[1] ?? "" },
        ],
      }),
    ).rejects.toThrow(guard(10));

    await resolveAfterKickoff(f.leader.personId, resultado.id, resultado.options[0] ?? "");
    // Falta un pronóstico del parley: todavía nadie cobra.
    expect(await balanceFor(ana.id, f.termId)).toBe(40);
    await resolveAfterKickoff(f.leader.personId, goles.id, goles.options[0] ?? "");
    expect(await balanceFor(ana.id, f.termId)).toBe(40 + 30);
    expect(await balanceFor(beto.id, f.termId)).toBe(30);
  });

  it("un parley con un pronóstico cancelado se devuelve", async () => {
    const f = await setup();
    await setMatchCapAs(f.gh, 30);
    const resultado = await marketWithOptions(f, "Resultado");
    const goles = await marketWithOptions(f, "Quién mete el primer gol");
    await openMarketAs(f.leader, resultado.id);
    await openMarketAs(f.leader, goles.id);
    const [ana] = f.people;
    if (!ana) throw new Error("falta Ana");
    await placePredictionAs(ana.actor, {
      occasionId: f.match,
      stake: 10,
      picks: [
        { marketId: resultado.id, optionId: resultado.options[0] ?? "" },
        { marketId: goles.id, optionId: goles.options[0] ?? "" },
      ],
    });

    await cancelMarketAs(f.leader, goles.id);
    await resolveAfterKickoff(f.leader.personId, resultado.id, resultado.options[0] ?? "");
    expect(await balanceFor(ana.id, f.termId)).toBe(50);
    const [ticket] = await getDb()
      .select()
      .from(predictionTicket)
      .where(eq(predictionTicket.personId, ana.id));
    expect(ticket).toMatchObject({ status: "REFUNDED", payout: 10 });
  });
});
