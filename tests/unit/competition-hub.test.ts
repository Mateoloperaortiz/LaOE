import { describe, expect, it } from "vitest";
import {
  HUB_FAILURE_WINDOW_MS,
  type HubSession,
  hubStateSchema,
  readHubSession,
  recentFailures,
  signHubSession,
  toHubState,
} from "@/modules/competition/domain/hub-pure";

// La sesión del hub de capitanes (ADR-096): una cookie firmada del equipo, no de una persona.

const secret = "secreto-de-prueba-con-largo-suficiente";
const now = new Date("2026-10-01T18:00:00Z");
const session: HubSession = {
  competitionId: "comp1abcdefgh",
  teamId: "team1abcdefgh",
  codeIssuedAt: Date.parse("2026-09-30T12:00:00Z"),
  expiresAt: now.getTime() + 60_000,
};

describe("sesión del hub de capitanes", () => {
  it("lee lo que firmó", () => {
    expect(readHubSession(secret, signHubSession(secret, session), now)).toEqual(session);
  });

  it("rechaza una cookie alterada, vencida, con otro secreto o mal formada", () => {
    const token = signHubSession(secret, session);
    expect(readHubSession(secret, token.replace("team1abcdefgh", "team2abcdefgh"), now)).toBeNull();
    expect(readHubSession(`${secret}-otro`, token, now)).toBeNull();
    expect(readHubSession(secret, token, new Date(session.expiresAt))).toBeNull();
    expect(readHubSession(secret, `${token}x`, now)).toBeNull();
    expect(readHubSession(secret, "v1.a.b.c", now)).toBeNull();
    expect(readHubSession(secret, undefined, now)).toBeNull();
    const other = signHubSession(secret, { ...session, codeIssuedAt: Number.NaN });
    expect(readHubSession(secret, other, now)).toBeNull();
  });

  it("cuenta solo los fallos de la ventana de 15 minutos", () => {
    const inside = now.getTime() - HUB_FAILURE_WINDOW_MS + 1;
    const outside = now.getTime() - HUB_FAILURE_WINDOW_MS;
    expect(recentFailures([outside, inside, now.getTime()], now)).toEqual([inside, now.getTime()]);
  });
});

describe("estado del hub", () => {
  const teams = [
    { id: "id-uno", number: 1, name: "Titanes", color: "#a53420" },
    { id: "id-dos", number: 2, name: "Olímpicos", color: null },
    { id: "id-tres", number: 3, name: "Centauros", color: null },
  ];
  const market = (
    id: string,
    status: "OPEN" | "CLOSED" | "RESOLVED" | "CANCELLED",
    bets: Array<{ id: string; teamId: string; pickTeamId: string; stake: number }>,
  ) => ({
    id,
    title: `Apuesta ${id}`,
    status,
    closesAt: null,
    winnerTeamId: status === "RESOLVED" ? "id-dos" : null,
    options: ["id-dos", "id-tres", "id-uno"],
    pools: new Map([["id-dos", 300]]),
    bets,
  });

  it("identifica a los equipos por número y da el resultado de cada apuesta propia", () => {
    const state = toHubState({
      competition: { name: "The Games", isRehearsal: false, allowSelfBet: false },
      teamId: "id-uno",
      teams,
      balance: 700,
      markets: [
        market("abierta", "OPEN", [
          { id: "b1", teamId: "id-uno", pickTeamId: "id-dos", stake: 300 },
        ]),
        market("otra", "OPEN", [{ id: "b9", teamId: "id-dos", pickTeamId: "id-tres", stake: 50 }]),
        market("ganada", "RESOLVED", [
          { id: "b2", teamId: "id-uno", pickTeamId: "id-dos", stake: 100 },
        ]),
        market("perdida", "RESOLVED", [
          { id: "b3", teamId: "id-uno", pickTeamId: "id-tres", stake: 100 },
        ]),
        market("devuelta", "RESOLVED", [
          { id: "b4", teamId: "id-uno", pickTeamId: "id-tres", stake: 80 },
        ]),
        market("cancelada", "CANCELLED", [
          { id: "b5", teamId: "id-uno", pickTeamId: "id-dos", stake: 60 },
        ]),
        market("cerrada", "CLOSED", []),
      ],
      route: [],
      powers: [],
      returns: new Map([
        ["b2", { kind: "PAYOUT" as const, amount: 250 }],
        ["b4", { kind: "REFUND" as const, amount: 80 }],
        ["b5", { kind: "REFUND" as const, amount: 60 }],
      ]),
    });
    expect(state.team).toEqual({ number: 1, name: "Titanes", color: "#a53420" });
    expect(state.markets.map((item) => item.id)).toEqual(["abierta", "otra"]);
    expect(state.markets[0]?.myBet).toEqual({ pick: 2, stake: 300 });
    expect(state.markets[1]?.myBet).toBeNull();
    expect(state.markets[0]?.options).toEqual([
      { number: 2, name: "Olímpicos", color: null, pool: 300, own: false },
      { number: 3, name: "Centauros", color: null, pool: 0, own: false },
      { number: 1, name: "Titanes", color: "#a53420", pool: 0, own: true },
    ]);
    expect(
      state.bets.map(({ marketId, result, amount }) => ({ marketId, result, amount })),
    ).toEqual([
      { marketId: "abierta", result: "PENDING", amount: 0 },
      { marketId: "ganada", result: "WON", amount: 250 },
      { marketId: "perdida", result: "LOST", amount: 0 },
      { marketId: "devuelta", result: "REFUNDED", amount: 80 },
      { marketId: "cancelada", result: "CANCELLED", amount: 60 },
    ]);
    const json = JSON.stringify(hubStateSchema.parse({ ...state, serverNow: now.toISOString() }));
    expect(json).not.toContain("id-uno");
    expect(json).not.toContain("id-dos");
    expect(json).not.toContain("b9");
  });
});
