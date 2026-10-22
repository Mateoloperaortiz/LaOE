import QRCode from "qrcode";
import { getEnv } from "@/env";
import { getPeopleByIds } from "@/modules/people";
import type {
  AttendanceExtent,
  AttendanceList,
  CheckInSource,
  CheckInStatus,
} from "./check-in-pure";
import { countCheckInsByStatus, listRecentCheckIns } from "./check-ins";
import type { OccasionStatus } from "./occasion-pure";
import type { OccasionRow } from "./occasions";
import { rotatingCodeAt, secondsUntilRotation } from "./rotating-code-pure";

// Contador en vivo de la consola (ADR-035 regla 16): un JSON que el cliente pide cada pocos segundos,
// con el QR regenerado en servidor para que embeba el código rotativo vigente.

/** Cuántos registros recientes lista la consola. */
const RECENT_SHOWN = 10;

export interface LiveCheckIn {
  id: string;
  name: string;
  at: string;
  source: CheckInSource;
  status: CheckInStatus;
  attendanceExtent: AttendanceExtent | null;
  attendanceList: AttendanceList | null;
}

export interface LiveSnapshot {
  status: OccasionStatus;
  counts: Record<CheckInStatus, number>;
  recent: LiveCheckIn[];
  code: { value: string; secondsLeft: number } | null;
  link: string;
  qrSvg: string;
  generatedAt: string;
}

export function checkInLink(publicId: string, code: string | null): string {
  const url = new URL(`/a/${publicId}`, getEnv().APP_URL);
  if (code) {
    url.searchParams.set("c", code);
  }
  return url.toString();
}

/** Lo que el snapshot toma de la ocasión. */
type LiveOccasion = Pick<
  OccasionRow,
  "id" | "publicId" | "status" | "requireRotatingCode" | "rotatingSecret"
>;

/**
 * El snapshot de la consola de una ocasión que su llamador ya leyó para decidir quién la opera: no la
 * vuelve a leer (ADR-123 regla 11). Si existe y quién la ve lo responde quien llama.
 */
export async function buildLiveSnapshot(
  row: LiveOccasion,
  now = new Date(),
): Promise<LiveSnapshot> {
  // La consola lo pide cada pocos segundos mientras la gente se registra: se le pide a la base lo que
  // se muestra, cinco conteos y diez filas, no todas las asistencias de la ocasión. Son dos lecturas
  // seguidas: un registro que entre entre una y otra puede salir en la lista un sondeo antes que en
  // su conteo.
  const counts = await countCheckInsByStatus(row.id);
  const recentRows = await listRecentCheckIns(row.id, RECENT_SHOWN);
  const people = await getPeopleByIds(recentRows.map((item) => item.personId));
  const code =
    row.requireRotatingCode && row.rotatingSecret
      ? {
          value: rotatingCodeAt(row.rotatingSecret, row.id, now),
          secondsLeft: secondsUntilRotation(now),
        }
      : null;
  const link = checkInLink(row.publicId, code?.value ?? null);
  const qrSvg = await QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return {
    status: row.status,
    counts,
    recent: recentRows.map((item) => ({
      id: item.id,
      name: people.get(item.personId)?.fullName?.trim() ?? "",
      at: item.at.toISOString(),
      source: item.source,
      status: item.status,
      attendanceExtent: item.attendanceExtent,
      attendanceList: item.attendanceList,
    })),
    code,
    link,
    qrSvg,
    generatedAt: now.toISOString(),
  };
}
