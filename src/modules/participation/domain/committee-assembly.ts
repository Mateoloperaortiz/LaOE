import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  listCommitteesForSelection,
  listLiveCommitteeIds,
  listLiveDirectionForTerm,
  listRepresentatives,
  listTermCommitteeMembers,
  type RepresentativeView,
} from "@/modules/people";
import { checkIn, committeeAssemblyAttendance, occasion } from "../schema";

// Asistencia de los comités a la Asamblea Directiva (Est. art. 16.2, 33.3 y 34.3; Regl. art. 14, 17 y
// 64; ADR-060 regla 7): dato derivado por asamblea cerrada y la escalera de consecuencias del término.
// La app informa; el voto y la desactivación siguen siendo decisiones de la asamblea y de la junta.

export type RepresentationLadder = 0 | 1 | 2 | 3;

/** Faltas sin excusa en el término → consecuencia del Regl. art. 64, en el orden de T-2250. */
export function representationLadder(unexcused: number): RepresentationLadder {
  if (unexcused <= 0) return 0;
  if (unexcused === 1) return 1;
  if (unexcused === 2) return 2;
  return 3;
}

/** Máximo de faltas con excusa válida por semestre (Regl. art. 64). */
export const MAX_EXCUSED_ABSENCES = 2;

export interface CommitteeAssemblyRow {
  occasionId: string;
  committeeId: string;
  termId: string;
  represented: boolean;
  excused: boolean;
  representedById: string | null;
}

/**
 * Recalcula qué comités estuvieron representados en una asamblea cerrada: los comités con miembros
 * activos en el término; representado si el titular, el suplente o cualquier cargo de dirección vivo
 * registró asistencia; con excusa si alguno de ellos tiene la excusa aceptada. Devuelve cuántas
 * filas escribió (0 si la ocasión no es una asamblea cerrada).
 */
export async function recomputeCommitteeAssembly(occasionId: string): Promise<number> {
  const db = getDb();
  const [row] = await db.select().from(occasion).where(eq(occasion.id, occasionId)).limit(1);
  if (!row || row.kind !== "ASSEMBLY" || row.status !== "CLOSED") {
    return 0;
  }
  const [members, representatives, direction, checkIns, alive] = await Promise.all([
    listTermCommitteeMembers(row.termId),
    listRepresentatives(row.termId),
    listLiveDirectionForTerm(row.termId),
    db
      .select({ personId: checkIn.personId, status: checkIn.status })
      .from(checkIn)
      .where(
        and(eq(checkIn.occasionId, occasionId), inArray(checkIn.status, ["APPROVED", "EXCUSED"])),
      ),
    listLiveCommitteeIds(),
  ]);
  const statusOf = new Map(checkIns.map((item) => [item.personId, item.status]));
  // Un comité desactivado no acumula faltas aunque le quede alguien activo (ADR-073 regla 4).
  const committees = new Set(
    members
      .filter(
        (item) => item.leftAt === null && item.status === "ACTIVE" && alive.has(item.committeeId),
      )
      .map((item) => item.committeeId),
  );
  const candidates = new Map<string, string[]>();
  const add = (committeeId: string, personId: string) => {
    const list = candidates.get(committeeId) ?? [];
    if (!list.includes(personId)) {
      list.push(personId);
    }
    candidates.set(committeeId, list);
  };
  for (const item of representatives) add(item.committeeId, item.personId);
  for (const item of direction) add(item.committeeId, item.personId);
  const now = new Date();
  const rows: CommitteeAssemblyRow[] = [...committees].map((committeeId) => {
    const people = candidates.get(committeeId) ?? [];
    const representedById =
      people.find((personId) => statusOf.get(personId) === "APPROVED") ?? null;
    const excused =
      representedById === null && people.some((personId) => statusOf.get(personId) === "EXCUSED");
    return {
      occasionId,
      committeeId,
      termId: row.termId,
      represented: representedById !== null,
      excused,
      representedById,
    };
  });
  await db.transaction(async (tx) => {
    for (const item of rows) {
      await tx
        .insert(committeeAssemblyAttendance)
        .values({ ...item, computedAt: now })
        .onConflictDoUpdate({
          target: [committeeAssemblyAttendance.occasionId, committeeAssemblyAttendance.committeeId],
          set: {
            represented: item.represented,
            excused: item.excused,
            representedById: item.representedById,
            computedAt: now,
          },
        });
    }
    await tx.delete(committeeAssemblyAttendance).where(
      and(
        eq(committeeAssemblyAttendance.occasionId, occasionId),
        rows.length > 0
          ? notInArray(
              committeeAssemblyAttendance.committeeId,
              rows.map((item) => item.committeeId),
            )
          : undefined,
      ),
    );
  });
  return rows.length;
}

export interface AssemblyRepresentation {
  occasionId: string;
  represented: number;
  excused: number;
  total: number;
}

/** Por asamblea cerrada del término: cuántos comités estuvieron representados. */
export async function listAssemblyRepresentation(
  termId: string,
): Promise<Map<string, AssemblyRepresentation>> {
  const rows = await getDb()
    .select()
    .from(committeeAssemblyAttendance)
    .where(eq(committeeAssemblyAttendance.termId, termId));
  const map = new Map<string, AssemblyRepresentation>();
  for (const row of rows) {
    const entry = map.get(row.occasionId) ?? {
      occasionId: row.occasionId,
      represented: 0,
      excused: 0,
      total: 0,
    };
    entry.total += 1;
    if (row.represented) entry.represented += 1;
    if (row.excused) entry.excused += 1;
    map.set(row.occasionId, entry);
  }
  return map;
}

export interface CommitteeRepresentationSummary {
  committeeId: string;
  committeeName: string;
  committeeSlug: string;
  titular: RepresentativeView | null;
  suplente: RepresentativeView | null;
  /** Asambleas cerradas del término en que el comité tenía miembros activos. */
  assemblies: number;
  represented: number;
  unexcused: number;
  excused: number;
  ladder: RepresentationLadder;
  /** Más de dos faltas con excusa en el semestre (Regl. art. 64). */
  excusedOverflow: boolean;
}

/** La escalera del término por comité, para GH y para la cabecera de cada comité. */
export async function listCommitteeRepresentation(
  termId: string,
): Promise<CommitteeRepresentationSummary[]> {
  const [committees, representatives, rows] = await Promise.all([
    listCommitteesForSelection(),
    listRepresentatives(termId),
    getDb()
      .select()
      .from(committeeAssemblyAttendance)
      .where(eq(committeeAssemblyAttendance.termId, termId)),
  ]);
  return committees
    .map((committee) => {
      const mine = rows.filter((row) => row.committeeId === committee.id);
      const represented = mine.filter((row) => row.represented).length;
      const excused = mine.filter((row) => row.excused).length;
      const unexcused = mine.length - represented - excused;
      return {
        committeeId: committee.id,
        committeeName: committee.name,
        committeeSlug: committee.slug,
        titular:
          representatives.find(
            (item) => item.committeeId === committee.id && item.role === "TITULAR",
          ) ?? null,
        suplente:
          representatives.find(
            (item) => item.committeeId === committee.id && item.role === "SUPLENTE",
          ) ?? null,
        assemblies: mine.length,
        represented,
        unexcused,
        excused,
        ladder: representationLadder(unexcused),
        excusedOverflow: excused > MAX_EXCUSED_ABSENCES,
      };
    })
    .filter((item) => item.assemblies > 0 || item.titular !== null || item.suplente !== null)
    .sort((a, b) => a.committeeName.localeCompare(b.committeeName, "es"));
}
