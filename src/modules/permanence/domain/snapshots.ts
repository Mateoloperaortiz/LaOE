import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { permanenceSnapshot } from "../schema";
import type { CommitteeResult, CriterionResult, MandatoryView } from "./permanence-pure";
import { parseGeneral, parseMandatory, parseResults } from "./snapshot-pure";

// Snapshots persistidos (ADR-036 regla 5): el recompute los escribe (tramo F4-T3); aquí las lecturas.

export interface SnapshotView {
  termId: string;
  personId: string;
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  isNew: boolean;
  probation: boolean;
  generalTotal: number;
  generalMax: number;
  general: CriterionResult[];
  results: CommitteeResult[];
  mandatory: MandatoryView;
  computedAt: Date;
  frozenAt: Date | null;
}

function toView(row: typeof permanenceSnapshot.$inferSelect): SnapshotView {
  return {
    termId: row.termId,
    personId: row.personId,
    status: row.status,
    isNew: row.isNew,
    probation: row.probation,
    generalTotal: row.generalTotal,
    generalMax: row.generalMax,
    general: parseGeneral(row.general),
    results: parseResults(row.results),
    mandatory: parseMandatory(row.mandatory),
    computedAt: row.computedAt,
    frozenAt: row.frozenAt,
  };
}

export async function getSnapshot(personId: string, termId: string): Promise<SnapshotView | null> {
  const [row] = await getDb()
    .select()
    .from(permanenceSnapshot)
    .where(and(eq(permanenceSnapshot.termId, termId), eq(permanenceSnapshot.personId, personId)))
    .limit(1);
  return row ? toView(row) : null;
}
