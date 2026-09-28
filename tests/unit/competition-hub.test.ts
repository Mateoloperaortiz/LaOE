import { describe, expect, it } from "vitest";
import {
  HUB_FAILURE_WINDOW_MS,
  type HubSession,
  readHubSession,
  recentFailures,
  signHubSession,
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
