import { describe, expect, it } from "vitest";
import {
  buildApplePassJson,
  buildGoogleClass,
  buildGoogleObject,
  buildGoogleTombstone,
  buildSaveClaims,
  type CarnetData,
  googleIdentifiers,
  isStalePass,
} from "@/modules/wallet/domain/pass-pure";
import { t } from "@/shared/copy";

const data: CarnetData = {
  personId: "sintetico000001",
  fullName: "Persona de Prueba",
  committees: [{ name: "Comité de prueba", role: "Miembro" }],
  term: { id: "termino0001", code: "2026-2" },
  firstTermCode: "2025-1",
  token: `oe2.${"a".repeat(32)}`,
  walletEpoch: 0,
  revision: 1,
};

describe("representación del carnet en billeteras", () => {
  it("Apple muestra solo los datos acordados y mantiene el QR sin vencimiento", () => {
    const pass = buildApplePassJson(data, {
      passTypeIdentifier: "pass.test.oe",
      teamIdentifier: "ABCDE12345",
      appUrl: "https://example.test",
    });
    expect(pass.serialNumber).toBe(data.personId);
    expect(pass.sharingProhibited).toBe(true);
    expect(pass.generic.primaryFields[0]?.value).toBe(data.fullName);
    expect(pass.generic.secondaryFields[0]).toMatchObject({
      label: "Miembro",
      value: "Comité de prueba",
    });
    expect(pass.generic.auxiliaryFields[0]?.value).toBe("2025-1");
    expect(pass.barcodes[0]?.message).toBe(data.token);
    expect(pass).not.toHaveProperty("expirationDate");
    expect(pass).not.toHaveProperty("webServiceURL");
    expect(pass.backgroundColor).toBe("rgb(0, 31, 62)");
    expect(JSON.stringify(pass)).not.toMatch(/photo|email|points/i);
  });

  it("sin término ni comités no inventa datos, y el dorso conserva todos los comités largos", () => {
    const config = {
      passTypeIdentifier: "pass.test.oe",
      teamIdentifier: "ABCDE12345",
      appUrl: "https://example.test",
    };
    const empty = buildApplePassJson(
      { ...data, term: null, committees: [], firstTermCode: null },
      config,
    );
    expect(empty.generic.headerFields).toEqual([]);
    expect(empty.generic.auxiliaryFields).toEqual([]);
    expect(empty.generic.secondaryFields[0]?.value).toBe(t("T-402"));
    const many = {
      ...data,
      committees: Array.from({ length: 5 }, (_, n) => ({ name: `Comité ${n}`, role: "General" })),
    };
    const pass = buildApplePassJson(many, config);
    expect(pass.generic.secondaryFields).toHaveLength(3);
    expect(pass.generic.backFields.find((field) => field.key === "committees")?.value).toContain(
      "Comité 4",
    );
  });

  it("Google separa ambientes, incluye logo HTTPS y usa identificadores en el JWT", () => {
    const ids = googleIdentifiers("123456789", "carnet-oe-staging", data.personId);
    expect(ids.id).not.toBe(googleIdentifiers("123456789", "carnet-oe", data.personId).id);
    expect(buildGoogleClass(ids.classId).multipleDevicesAndHoldersAllowedStatus).toBe(
      "ONE_USER_ALL_DEVICES",
    );
    const pass = buildGoogleObject(data, { ...ids, appUrl: "https://example.test" });
    expect(pass.logo?.sourceUri.uri).toBe("https://example.test/wallet/google-logo.png");
    expect(pass.barcode.value).toBe(data.token);
    expect(pass.header.defaultValue.value).toBe(data.fullName);
    expect(pass.textModulesData).toHaveLength(2);
    expect(pass.hexBackgroundColor).toBe("#001F3E");
    expect(
      buildGoogleObject({ ...data, term: null }, { ...ids, appUrl: "http://localhost:3000" }),
    ).not.toHaveProperty("logo");
    const claims = buildSaveClaims(
      { ...ids, appUrl: "https://example.test/app", serviceAccountEmail: "test@example.invalid" },
      new Date("2026-09-01T00:00:00Z"),
    );
    expect(claims).toMatchObject({
      aud: "google",
      typ: "savetowallet",
      origins: ["https://example.test"],
      iat: 1788220800,
    });
    expect(claims.payload.genericObjects).toEqual([ids]);
    expect(JSON.stringify(claims)).not.toContain(data.token);
  });

  it("el objeto anónimo es mínimo, válido y sin datos personales ni QR vacío", () => {
    const pass = buildGoogleTombstone("123.objeto", "123.clase");
    expect(pass).toEqual({
      id: "123.objeto",
      classId: "123.clase",
      state: "EXPIRED",
      cardTitle: { defaultValue: { language: "es-CO", value: t("T-1197") } },
      header: { defaultValue: { language: "es-CO", value: t("T-223") } },
    });
  });

  it("Apple queda desactualizado tras rotación ADMIN, baja o cambio de término incluso a null", () => {
    const pass = { walletEpoch: 0, tokenRevision: 1, renderedTermId: "termino0001" };
    expect(isStalePass(pass, data, data.term?.id ?? null)).toBe(false);
    expect(isStalePass(pass, { walletEpoch: 0, revision: 2 }, "termino0001")).toBe(true);
    expect(isStalePass(pass, { walletEpoch: 1, revision: 1 }, "termino0001")).toBe(true);
    expect(isStalePass(pass, data, null)).toBe(true);
    expect(isStalePass(pass, null, "termino0001")).toBe(true);
  });
});
