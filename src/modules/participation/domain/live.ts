import QRCode from "qrcode";
import { getEnv } from "@/env";
import { getPeopleByIds } from "@/modules/people";
import { CHECK_IN_STATUSES, type CheckInSource, type CheckInStatus } from "./check-in-pure";
import { listCheckIns } from "./check-ins";
import type { OccasionStatus } from "./occasion-pure";
import { getOccasion } from "./occasions";
import { rotatingCodeAt, secondsUntilRotation } from "./rotating-code-pure";

// Contador en vivo de la consola (ADR-035 regla 16): un JSON que el cliente pide cada pocos segundos,
// con el QR regenerado en servidor para que embeba el código rotativo vigente.

export interface LiveCheckIn {
  id: string;
  name: string;
  at: string;
  source: CheckInSource;
  status: CheckInStatus;
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

export async function buildLiveSnapshot(
  occasionId: string,
  now = new Date(),
): Promise<LiveSnapshot | null> {
  const row = await getOccasion(occasionId);
  if (!row) {
    return null;
  }
  const checkIns = await listCheckIns(row.id);
  const counts = Object.fromEntries(CHECK_IN_STATUSES.map((status) => [status, 0])) as Record<
    CheckInStatus,
    number
  >;
  for (const item of checkIns) {
    counts[item.status] += 1;
  }
  const recentRows = checkIns.slice(0, 10);
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
    })),
    code,
    link,
    qrSvg,
    generatedAt: now.toISOString(),
  };
}
