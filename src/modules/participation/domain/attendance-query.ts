import { and, eq } from "drizzle-orm";
import { checkIn } from "../schema";

/** Solo la presencia completa y aprobada alimenta los efectos de una asistencia acreditada. */
export function approvedCompleteAttendanceCondition() {
  return and(eq(checkIn.status, "APPROVED"), eq(checkIn.attendanceExtent, "FULL"));
}

export function completeAttendanceCondition() {
  return eq(checkIn.attendanceExtent, "FULL");
}
