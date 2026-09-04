import { describe, expect, it } from "vitest";
import { signCarnet, verifyCarnet } from "@/modules/identity/domain/carnet-pure";

const secret = "s".repeat(32);
const personId = "abcdefghij1234567890";
const now = new Date("2026-09-03T15:00:00Z");

describe("token del carnet", () => {
  it("firma y verifica un token de 24 horas", () => {
    const signed = signCarnet(personId, { secret, now });
    expect(signed.token.startsWith(`oe1.${personId}.`)).toBe(true);
    expect(signed.expiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    const result = verifyCarnet(signed.token, { secret, now });
    expect(result).toEqual({ ok: true, personId, expiresAt: signed.expiresAt });
    const later = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    expect(verifyCarnet(signed.token, { secret, now: later }).ok).toBe(true);
  });

  it("vence a las 24 horas", () => {
    const signed = signCarnet(personId, { secret, now });
    const expired = new Date(signed.expiresAt.getTime());
    expect(verifyCarnet(signed.token, { secret, now: expired })).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("rechaza firmas manipuladas, otro secreto y tokens malformados", () => {
    const signed = signCarnet(personId, { secret, now });
    const [prefix, id, minutes, sig] = signed.token.split(".") as [string, string, string, string];
    const otherPerson = `${prefix}.zzzzzzzzzz1234567890.${minutes}.${sig}`;
    expect(verifyCarnet(otherPerson, { secret, now })).toEqual({
      ok: false,
      reason: "BAD_SIGNATURE",
    });
    const laterExpiry = `${prefix}.${id}.${Number.parseInt(minutes, 10) + 60}.${sig}`;
    expect(verifyCarnet(laterExpiry, { secret, now }).ok).toBe(false);
    expect(verifyCarnet(signed.token, { secret: "x".repeat(32), now })).toEqual({
      ok: false,
      reason: "BAD_SIGNATURE",
    });
    for (const bad of ["", "oe1", `oe2.${id}.${minutes}.${sig}`, `oe1.${id}.abc.${sig}`, "a.b.c"]) {
      expect(verifyCarnet(bad, { secret, now })).toEqual({ ok: false, reason: "MALFORMED" });
    }
    expect(() => signCarnet("no válido", { secret, now })).toThrow();
  });
});
