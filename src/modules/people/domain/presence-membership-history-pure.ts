import { z } from "zod";

type MembershipStatus = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
type StatusChange = { at: Date; from: MembershipStatus | null; to: MembershipStatus };

interface CommitteeRow {
  committeeId: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  createdAt: Date;
}

interface AuditFact {
  action: string;
  at: Date;
  before: unknown;
  after: unknown;
}

interface CommitteeInterval {
  committeeId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

const snapshotSchema = z.object({
  termId: z.string(),
  committees: z.array(z.object({ committeeId: z.string() })),
});
const singleSchema = z.object({ termId: z.string(), committeeId: z.string() });
const effectiveSchema = z.object({ effectiveAt: z.iso.datetime() });

function effectiveAt(fact: AuditFact): Date {
  const parsed = effectiveSchema.safeParse(fact.after);
  return parsed.success ? new Date(parsed.data.effectiveAt) : fact.at;
}

/**
 * La fila actual no demuestra que alguien perteneció sin interrupción: al reingresar cambia o
 * conserva joinedAt y borra leftAt. Los snapshots y altas auditadas separan cada intervalo.
 * Una salida de fecha desconocida descarta el tramo abierto, sin inventar faltas dentro del hueco.
 */
export function presenceCommitteeIntervals(
  rows: readonly CommitteeRow[],
  audits: readonly AuditFact[],
  termId: string,
): CommitteeInterval[] {
  const intervals: CommitteeInterval[] = [];
  const open = new Map<string, Date>();
  const touched = new Set<string>();
  let incomplete = false;
  const priority = (action: string) =>
    action === "committee-membership.closed" ? 0 : action === "committee-membership.set" ? 1 : 2;
  const ordered = [...audits].sort(
    (a, b) =>
      effectiveAt(a).getTime() - effectiveAt(b).getTime() ||
      priority(a.action) - priority(b.action),
  );

  function close(committeeId: string, at: Date) {
    const joinedAt = open.get(committeeId);
    if (joinedAt && at > joinedAt) intervals.push({ committeeId, joinedAt, leftAt: at });
    open.delete(committeeId);
  }

  for (const fact of ordered) {
    const at = effectiveAt(fact);
    if (fact.action === "committee-membership.set") {
      const before = snapshotSchema.safeParse(fact.before);
      const after = snapshotSchema.safeParse(fact.after);
      if (!before.success || !after.success) {
        incomplete = true;
        open.clear();
        continue;
      }
      if (before.data.termId !== termId || after.data.termId !== termId) continue;
      const previous = new Set(before.data.committees.map((row) => row.committeeId));
      const next = new Set(after.data.committees.map((row) => row.committeeId));
      for (const committeeId of new Set([...previous, ...next, ...open.keys()])) {
        touched.add(committeeId);
        if (!previous.has(committeeId)) open.delete(committeeId);
        if (!next.has(committeeId)) close(committeeId, at);
        else if (!open.has(committeeId)) open.set(committeeId, at);
      }
    } else {
      const parsed = singleSchema.safeParse(fact.after);
      if (!parsed.success) {
        incomplete = true;
        open.clear();
        continue;
      }
      if (parsed.data.termId !== termId) continue;
      const { committeeId } = parsed.data;
      touched.add(committeeId);
      if (fact.action === "committee-membership.closed") close(committeeId, at);
      else if (fact.action === "committee-membership.added") {
        // Una alta sobre un tramo aún abierto demuestra que falta el cierre anterior; no su fecha.
        open.set(committeeId, at);
      }
    }
  }

  for (const row of rows) {
    if (open.has(row.committeeId)) {
      const joinedAt = open.get(row.committeeId);
      if (!joinedAt) continue;
      if (row.leftAt) close(row.committeeId, row.leftAt);
      else intervals.push({ committeeId: row.committeeId, joinedAt, leftAt: null });
      open.delete(row.committeeId);
    } else if (!touched.has(row.committeeId) && !incomplete) {
      // Sin ningún cambio auditado, la fila demuestra su estado desde que existe, nunca antes.
      const joinedAt = new Date(Math.max(row.createdAt.getTime(), row.joinedAt?.getTime() ?? 0));
      if (!row.leftAt || row.leftAt > joinedAt)
        intervals.push({ committeeId: row.committeeId, joinedAt, leftAt: row.leftAt });
    }
  }
  return intervals.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
}

/** Antes de la primera evidencia no se proyecta el estado actual sobre todo el semestre. */
export function presenceStatusChanges(input: {
  createdAt: Date;
  status: MembershipStatus;
  changes: readonly StatusChange[];
}): StatusChange[] {
  const ordered = [...input.changes].sort((a, b) => a.at.getTime() - b.at.getTime());
  const first = ordered[0];
  const initial = first?.from ?? first?.to ?? input.status;
  const knownFrom = first && first.at < input.createdAt ? first.at : input.createdAt;
  return [{ at: knownFrom, from: "INACTIVE", to: initial }, ...ordered];
}
