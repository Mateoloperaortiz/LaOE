import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getPeopleByIds } from "@/modules/people";
import { checkIn, occasion } from "../schema";
import type { CheckInSource, CheckInStatus } from "./check-in-pure";

// Lecturas planas para los exportes CSV (ADR-035 regla 17): con nombre y correo, solo para ADMIN.

export interface CheckInExportRow {
  id: string;
  personName: string;
  email: string;
  occasionTitle: string;
  occasionId: string;
  at: Date;
  source: CheckInSource;
  status: CheckInStatus;
  reason: string | null;
}

export async function listCheckInsForExport(params: {
  q: string;
  occasionId?: string | undefined;
  termId?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: CheckInExportRow[]; total: number }> {
  const conditions = [];
  if (params.occasionId) {
    conditions.push(eq(checkIn.occasionId, params.occasionId));
  }
  if (params.termId) {
    conditions.push(
      inArray(
        checkIn.occasionId,
        getDb()
          .select({ id: occasion.id })
          .from(occasion)
          .where(eq(occasion.termId, params.termId)),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await getDb()
    .select({ row: checkIn, occasionTitle: occasion.title })
    .from(checkIn)
    .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
    .where(where)
    .orderBy(desc(checkIn.at))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const people = await getPeopleByIds(rows.map((item) => item.row.personId));
  const mapped = rows
    .map((item) => ({
      id: item.row.id,
      personName: people.get(item.row.personId)?.fullName?.trim() ?? "",
      email: people.get(item.row.personId)?.email ?? "",
      occasionTitle: item.occasionTitle,
      occasionId: item.row.occasionId,
      at: item.row.at,
      source: item.row.source,
      status: item.row.status,
      reason: item.row.reason,
    }))
    .filter((item) => !params.q || item.personName.toLowerCase().includes(params.q.toLowerCase()));
  return { rows: mapped, total: mapped.length };
}
