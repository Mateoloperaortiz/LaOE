import { describe, expect, it } from "vitest";
import { canRequestExcuse, isCompleteAttendance } from "@/modules/participation";

describe("asistencia completa y parcial", () => {
  it("acredita la completa aprobada y conserva la parcial sin acreditarla como completa", () => {
    expect(isCompleteAttendance({ status: "APPROVED", attendanceExtent: "FULL" })).toBe(true);
    expect(isCompleteAttendance({ status: "APPROVED", attendanceExtent: "PARTIAL" })).toBe(false);
    expect(isCompleteAttendance({ status: "EXCUSED", attendanceExtent: "PARTIAL" })).toBe(false);
  });

  it("permite excusar una parcial aprobada y mantiene cerrada la excusa para una completa", () => {
    expect(canRequestExcuse({ status: "APPROVED", attendanceExtent: "PARTIAL" })).toBe(true);
    expect(canRequestExcuse({ status: "APPROVED", attendanceExtent: "FULL" })).toBe(false);
    expect(canRequestExcuse({ status: "EXCUSED", attendanceExtent: "PARTIAL" })).toBe(false);
    expect(canRequestExcuse(null)).toBe(true);
  });

  it("no inventa presencia cuando el registro dice que no hubo asistencia", () => {
    expect(isCompleteAttendance({ status: "APPROVED", attendanceExtent: null })).toBe(false);
  });
});
