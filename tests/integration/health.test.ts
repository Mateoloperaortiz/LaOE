import { describe, expect, it } from "vitest";
import { checkDatabase } from "@/modules/system";

describe("checkDatabase", () => {
  it("responde con la versión de PostgreSQL 18", async () => {
    const status = await checkDatabase();
    expect(status.ok).toBe(true);
    if (status.ok) {
      expect(status.version).toMatch(/^PostgreSQL 18/);
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});
