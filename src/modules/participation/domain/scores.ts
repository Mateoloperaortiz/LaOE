import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { checkIn, committeeParticipation, occasion } from "../schema";
import { approvedCompleteAttendanceCondition } from "./attendance-query";
import { meanRate, rawRate, round4, smoothedRate } from "./ledger-pure";

// Score de comité por ocasión (ADR-009, ADR-024, ADR-035 regla 11). Corre por outbox con clave por
// ocasión y advisory lock, en su propia transacción; los elegibles llegan de `people` ya leídos.

export interface TermCommitteeMember {
  personId: string;
  committeeId: string;
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  joinedAt: Date | null;
  leftAt: Date | null;
}

export type CommitteeParticipationRow = typeof committeeParticipation.$inferSelect;

/**
 * Elegibles por comité: activos con pertenencia viva al empezar la ocasión (ADR-005): quien entró
 * después o salió antes de `startsAt` no cuenta en el denominador.
 */
export function eligibleByCommittee(
  roster: ReadonlyArray<TermCommitteeMember>,
  startsAt: Date,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const member of roster) {
    if (member.status !== "ACTIVE") {
      continue;
    }
    if (member.joinedAt && member.joinedAt > startsAt) {
      continue;
    }
    if (member.leftAt && member.leftAt <= startsAt) {
      continue;
    }
    const set = map.get(member.committeeId) ?? new Set<string>();
    set.add(member.personId);
    map.set(member.committeeId, set);
  }
  return map;
}

/**
 * Recalcula el score de la ocasión: una fila por comité con elegibles; con la ocasión cerrada el
 * denominador queda congelado y solo cambian los presentes. Devuelve cuántas filas quedaron.
 */
export async function recomputeOccasionScore(
  occasionId: string,
  roster: ReadonlyArray<TermCommitteeMember>,
  shrinkK: number,
  now = new Date(),
): Promise<number> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`score:${occasionId}`}))`);
    const [row] = await tx.select().from(occasion).where(eq(occasion.id, occasionId)).limit(1);
    if (!row || row.points === 0) {
      return 0;
    }
    const approved = await tx
      .select({ personId: checkIn.personId })
      .from(checkIn)
      .where(and(eq(checkIn.occasionId, occasionId), approvedCompleteAttendanceCondition()));
    const present = new Set(approved.map((item) => item.personId));
    const existing = await tx
      .select()
      .from(committeeParticipation)
      .where(eq(committeeParticipation.occasionId, occasionId));
    const frozenById = new Map(
      existing.filter((item) => item.frozenAt !== null).map((item) => [item.committeeId, item]),
    );
    const eligible = eligibleByCommittee(roster, row.startsAt);
    const committeeIds = new Set([...eligible.keys(), ...frozenById.keys()]);
    const computed: Array<{
      committeeId: string;
      eligible: number;
      present: number;
      frozenAt: Date | null;
    }> = [];
    for (const committeeId of committeeIds) {
      const members = eligible.get(committeeId) ?? new Set<string>();
      const frozen = frozenById.get(committeeId);
      const eligibleCount = frozen ? frozen.eligible : members.size;
      if (eligibleCount === 0) {
        continue;
      }
      const presentCount = [...members].filter((personId) => present.has(personId)).length;
      computed.push({
        committeeId,
        eligible: eligibleCount,
        present: presentCount,
        frozenAt: frozen?.frozenAt ?? (row.status === "CLOSED" ? now : null),
      });
    }
    const mu = meanRate(computed.map((item) => rawRate(item.present, item.eligible)));
    const keep = new Set(computed.map((item) => item.committeeId));
    const stale = existing.filter((item) => !keep.has(item.committeeId)).map((item) => item.id);
    if (stale.length > 0) {
      await tx.delete(committeeParticipation).where(inArray(committeeParticipation.id, stale));
    }
    for (const item of computed) {
      const values = {
        occasionId,
        committeeId: item.committeeId,
        termId: row.termId,
        eligible: item.eligible,
        present: item.present,
        rate: round4(rawRate(item.present, item.eligible)),
        smoothedRate: round4(smoothedRate(item.present, item.eligible, mu, shrinkK)),
        frozenAt: item.frozenAt,
        computedAt: now,
      };
      await tx
        .insert(committeeParticipation)
        .values(values)
        .onConflictDoUpdate({
          target: [committeeParticipation.occasionId, committeeParticipation.committeeId],
          set: values,
        });
    }
    return computed.length;
  });
}

export async function listOccasionScores(occasionId: string): Promise<CommitteeParticipationRow[]> {
  return getDb()
    .select()
    .from(committeeParticipation)
    .where(eq(committeeParticipation.occasionId, occasionId));
}

export interface CommitteeOccasionScore extends CommitteeParticipationRow {
  occasionTitle: string;
  occasionStartsAt: Date;
  occasionStatus: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
}

/** Las ocasiones con puntos del término vistas desde un comité (vista de líder). */
export async function listCommitteeScores(
  committeeId: string,
  termId: string,
): Promise<CommitteeOccasionScore[]> {
  const rows = await getDb()
    .select({
      row: committeeParticipation,
      occasionTitle: occasion.title,
      occasionStartsAt: occasion.startsAt,
      occasionStatus: occasion.status,
    })
    .from(committeeParticipation)
    .innerJoin(occasion, eq(occasion.id, committeeParticipation.occasionId))
    .where(
      and(
        eq(committeeParticipation.committeeId, committeeId),
        eq(committeeParticipation.termId, termId),
      ),
    )
    .orderBy(occasion.startsAt);
  return rows.map((item) => ({
    ...item.row,
    occasionTitle: item.occasionTitle,
    occasionStartsAt: item.occasionStartsAt,
    occasionStatus: item.occasionStatus,
  }));
}
