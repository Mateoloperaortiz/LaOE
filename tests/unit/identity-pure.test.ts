import { describe, expect, it } from "vitest";
import {
  codeMatches,
  describeUserAgent,
  generateCode,
  hashCode,
  hashToken,
  isInstitutionalEmail,
  normalizeEmail,
  safeNextPath,
} from "@/modules/identity/domain/pure";

describe("safeNextPath", () => {
  it("acepta rutas del mismo origen con query", () => {
    expect(safeNextPath("/app/ajustes?x=1")).toBe("/app/ajustes?x=1");
  });
  it("rechaza orígenes externos, esquemas y trucos de barras", () => {
    for (const bad of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "",
      42,
      null,
      "/app\n",
    ]) {
      expect(safeNextPath(bad)).toBe("/app");
    }
  });
  it("excluye /ingresar y /api", () => {
    expect(safeNextPath("/ingresar")).toBe("/app");
    expect(safeNextPath("/ingresar/x?next=/app")).toBe("/app");
    expect(safeNextPath("/api/health")).toBe("/app");
    expect(safeNextPath("/apisonadora")).toBe("/apisonadora");
  });
  it("usa el fallback pedido", () => {
    expect(safeNextPath(undefined, "/admin")).toBe("/admin");
  });
});

describe("códigos y hashes", () => {
  it("genera seis dígitos o respeta el fijo", () => {
    expect(generateCode()).toMatch(/^\d{6}$/);
    expect(generateCode("123456")).toBe("123456");
  });
  it("el hash depende del secreto, el correo y el código", () => {
    const a = hashCode("s", "a@eafit.edu.co", "111111");
    expect(a).toBe(hashCode("s", "a@eafit.edu.co", "111111"));
    expect(a).not.toBe(hashCode("t", "a@eafit.edu.co", "111111"));
    expect(a).not.toBe(hashCode("s", "b@eafit.edu.co", "111111"));
    expect(codeMatches(a, "s", "a@eafit.edu.co", "111111")).toBe(true);
    expect(codeMatches(a, "s", "a@eafit.edu.co", "111112")).toBe(false);
  });
  it("el hash del token es estable", () => {
    expect(hashToken("abc")).toHaveLength(64);
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });
});

describe("correo y dispositivo", () => {
  it("normaliza y valida el dominio institucional", () => {
    expect(normalizeEmail("  Mateo@EAFIT.edu.co ")).toBe("mateo@eafit.edu.co");
    expect(isInstitutionalEmail("a@eafit.edu.co", ["eafit.edu.co"])).toBe(true);
    expect(isInstitutionalEmail("a@gmail.com", ["eafit.edu.co"])).toBe(false);
  });
  it("describe el agente de usuario sin librerías", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ browser: "Safari", os: "iPhone" });
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
      ),
    ).toEqual({ browser: "Chrome", os: "Mac" });
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null });
  });
});
