import { describe, expect, it } from "vitest";
import {
  CARNET_TOKEN,
  createWalletCarnetToken,
  signCarnet,
  verifyCarnet,
} from "@/modules/identity/domain/carnet-pure";

const secret = "s".repeat(32);
const personId = "abcdefghij1234567890";
const now = new Date("2026-09-03T15:00:00Z");

describe("token del carnet", () => {
  it("genera capacidades opacas oe2 de 24 bytes y limita el formato antes de resolverlas", () => {
    const tokens = Array.from({ length: 20 }, createWalletCarnetToken);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(CARNET_TOKEN.test(token)).toBe(true);
      expect(token).toHaveLength(36);
      expect(Buffer.from(token.slice(4), "base64url")).toHaveLength(24);
    }
    for (const token of [
      "",
      "oe2",
      `oe1.${"a".repeat(32)}`,
      `oe2.${"a".repeat(31)}`,
      `oe2.${"a".repeat(65)}`,
      `oe2.${"a".repeat(32)}.firma`,
      `oe2.${"a".repeat(32)}\n`,
      `oe2.${"a".repeat(31)}+`,
    ]) {
      expect(CARNET_TOKEN.test(token)).toBe(false);
    }
  });

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
