import { describe, expect, it } from "vitest";
import { comprobarBaseDeDatos } from "@/modules/system";

describe("comprobarBaseDeDatos", () => {
  it("responde con la versión de PostgreSQL 18", async () => {
    const estado = await comprobarBaseDeDatos();
    expect(estado.ok).toBe(true);
    if (estado.ok) {
      expect(estado.version).toMatch(/^PostgreSQL 18/);
      expect(estado.latenciaMs).toBeGreaterThanOrEqual(0);
    }
  });
});
