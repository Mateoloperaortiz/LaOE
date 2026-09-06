import { describe, expect, it } from "vitest";
import { isPrivacyPolicyReady } from "@/modules/system/domain/privacy-pure";

describe("versión de la política", () => {
  it.each([
    null,
    undefined,
    "",
    "  ",
    "pendiente",
    " Pendiente ",
    1,
    {},
  ])("rechaza el marcador o una versión ausente: %s", (version) => {
    expect(isPrivacyPolicyReady(version)).toBe(false);
  });
  it.each(["prueba-v1", "2026-09-v1"])("acepta una versión explícita: %s", (version) => {
    expect(isPrivacyPolicyReady(version)).toBe(true);
  });
});
