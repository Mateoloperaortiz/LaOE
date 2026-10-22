import { describe, expect, it } from "vitest";
import { attendanceCell, excuseCell } from "@/modules/participation/admin";

describe("la asistencia y su excusa se muestran por separado", () => {
  it("conserva la lista parcial cuando la excusa ya fue aceptada", () => {
    const row = {
      status: "EXCUSED" as const,
      attendanceExtent: "PARTIAL" as const,
      attendanceList: "FIRST" as const,
    };

    expect(attendanceCell(row)).toBe("Parcial · Lista 1");
    expect(excuseCell(row)).toBe("Aprobada");
  });
});
