import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { request } from "../schema";
import type { RequestStatus } from "./requests-pure";

export interface ExcuseState {
  occasionId: string;
  personId: string;
  status: RequestStatus;
  submittedAt: Date;
}

/** La aceptación prevalece; de lo contrario, el último trámite. Sin causal, motivo ni payload. */
export async function listExcuseStates(
  scope: { occasionId: string } | { personId: string },
): Promise<ExcuseState[]> {
  const rows = await getDb()
    .select({
      occasionId: request.occasionId,
      personId: request.personId,
      status: request.status,
      submittedAt: request.createdAt,
    })
    .from(request)
    .where(
      and(
        eq(request.kind, "EXCUSE"),
        "occasionId" in scope
          ? eq(request.occasionId, scope.occasionId)
          : eq(request.personId, scope.personId),
      ),
    )
    .orderBy(desc(request.createdAt), desc(request.id));

  const latest = new Map<string, ExcuseState>();
  for (const row of rows) {
    if (!row.occasionId) continue;
    const key = `${row.occasionId}:${row.personId}`;
    const current = latest.get(key);
    if (!current || (row.status === "APPROVED" && current.status !== "APPROVED")) {
      latest.set(key, { ...row, occasionId: row.occasionId });
    }
  }
  return [...latest.values()];
}
