import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  burnPasswordTime,
  checkPassword,
  codeMatches,
  describeUserAgent,
  generateAccessToken,
  generateCode,
  hashCode,
  hashPassword,
  hashToken,
  isInstitutionalEmail,
  normalizeEmail,
  safeNextPath,
  verifyPassword,
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

describe("contraseña propia (ADR-051)", () => {
  it("guarda los parámetros en el hash y verifica contra ellos", async () => {
    const hash = await hashPassword("una frase larga y propia");
    expect(hash.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
    expect(await verifyPassword(hash, "una frase larga y propia")).toBe(true);
    expect(await verifyPassword(hash, "una frase larga y ajena")).toBe(false);
  });

  it("usa una sal distinta en cada hash", async () => {
    const [uno, otro] = await Promise.all([
      hashPassword("misma clave"),
      hashPassword("misma clave"),
    ]);
    expect(uno).not.toBe(otro);
  });

  it("sigue verificando un hash con parámetros viejos", async () => {
    // Sube el costo sin migración: lo que decide es lo que está guardado, no lo que rige hoy.
    const salt = Buffer.from("sal-de-prueba-16");
    const derived = scryptSync("clave de antes", salt, 32, { N: 1024, r: 8, p: 1 });
    const viejo = `scrypt$1024$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
    expect(await verifyPassword(viejo, "clave de antes")).toBe(true);
    expect(await verifyPassword(viejo, "otra cosa")).toBe(false);
  });

  it("rechaza un hash mal formado sin reventar", async () => {
    for (const roto of [
      "",
      "scrypt$32768$8$1$solo-cinco",
      "argon2$1$2$3$a$b",
      "scrypt$x$8$1$a$b",
    ]) {
      expect(await verifyPassword(roto, "lo que sea")).toBe(false);
    }
  });

  it("gasta tiempo cuando no hay credencial", async () => {
    await expect(burnPasswordTime()).resolves.toBeUndefined();
  });
});

describe("checkPassword", () => {
  const contexto = { email: "mateo.lopera@eafit.edu.co", names: ["Mateo", "Lopera Ortiz"] };

  it("acepta una contraseña larga que no es de nadie", () => {
    expect(checkPassword("caracol de tinta 91", contexto)).toBeNull();
  });

  it("exige el mínimo de diez caracteres", () => {
    expect(checkPassword("nueve car", contexto)).toBe("SHORT");
    expect(checkPassword("diez chars", contexto)).toBeNull();
  });

  it("rechaza las comunes y las de un solo carácter repetido", () => {
    expect(checkPassword("qwertyuiop", contexto)).toBe("COMMON");
    expect(checkPassword("Contraseña123", contexto)).toBe("COMMON");
    expect(checkPassword("aaaaaaaaaaaa", contexto)).toBe("COMMON");
  });

  it("rechaza lo que lleva el correo o el nombre, con o sin tildes", () => {
    expect(checkPassword("mateo es el mejor", contexto)).toBe("PERSONAL");
    expect(checkPassword("xx lopera xx 2026", contexto)).toBe("PERSONAL");
    expect(checkPassword("nada de LOPERA acá", contexto)).toBe("PERSONAL");
    expect(checkPassword("un rato con Mátéó", contexto)).toBe("PERSONAL");
  });

  it("no se confunde con fragmentos de menos de cuatro letras", () => {
    expect(
      checkPassword("bulevar de tinta", { email: "ana@eafit.edu.co", names: ["Ana"] }),
    ).toBeNull();
  });
});

describe("generateAccessToken", () => {
  it("da tokens opacos distintos y sin caracteres de URL", () => {
    const uno = generateAccessToken();
    expect(uno).not.toBe(generateAccessToken());
    expect(uno).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
