import { describe, expect, it } from "vitest";
import { type AnyResource, indexResources } from "@/shared/admin-kit/types";

const resource = (key: string) => ({ key }) as AnyResource;

describe("registro de recursos del admin", () => {
  it("indexa por clave", () => {
    const byKey = indexResources([resource("comites"), resource("personas")]);
    expect([...byKey.keys()]).toEqual(["comites", "personas"]);
    expect(byKey.get("personas")?.key).toBe("personas");
  });

  it("rechaza una clave repetida en vez de dejar que el segundo tape al primero", () => {
    expect(() => indexResources([resource("comites"), resource("comites")])).toThrow(
      "Recurso del admin registrado dos veces: comites",
    );
  });
});
