import { describe, expect, it, vi } from "vitest";
import { remapRosterPreviewAs } from "@/modules/people/domain/roster";
import { DomainError } from "@/shared/lib/errors";

vi.mock("@/db/client", () => ({
  getDb() {
    throw new Error("Se consultó la base antes de rechazar el mapeo");
  },
}));

describe("mapeo recibido por el comando del roster", () => {
  it("rechaza el exceso antes de recorrerlo o leer el trabajo y el archivo", async () => {
    const mapping: null[] = [];
    Object.defineProperty(mapping, 0, {
      get() {
        throw new Error("Se recorrió el mapeo");
      },
    });
    mapping.length = 1_001;
    await expect(
      remapRosterPreviewAs({ personId: "admin-sintetico", ip: null }, "job-sintetico", mapping),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
