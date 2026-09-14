import { describe, expect, it } from "vitest";
import { leaveExpired, leaveUntilError, leaveWindow } from "@/modules/people/domain/leave-pure";

// Licencia con vencimiento (Est. art. 5.4 y 11.3; ADR-060 regla 10).

describe("licencia con vencimiento", () => {
  it("el regreso va desde mañana y hasta un año", () => {
    expect(leaveWindow("2026-09-13")).toEqual({ min: "2026-09-14", max: "2027-09-13" });
    expect(leaveUntilError(undefined, "2026-09-13")).toBe("T-2274");
    expect(leaveUntilError("", "2026-09-13")).toBe("T-2274");
    expect(leaveUntilError("2026-09-13", "2026-09-13")).toBe("T-2275");
    expect(leaveUntilError("2026-09-14", "2026-09-13")).toBeNull();
    expect(leaveUntilError("2027-09-13", "2026-09-13")).toBeNull();
    expect(leaveUntilError("2027-09-14", "2026-09-13")).toBe("T-2275");
  });

  it("vence el día siguiente al regreso previsto", () => {
    expect(leaveExpired(null, "2026-09-13")).toBe(false);
    expect(leaveExpired("2026-09-13", "2026-09-13")).toBe(false);
    expect(leaveExpired("2026-09-12", "2026-09-13")).toBe(true);
  });
});
