import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { permanenceSnapshot } from "../schema";
import { loadPeopleFacts, loadTermFacts } from "./facts";
import {
  type CommitteeResult,
  type CriterionResult,
  computePerson,
  type MandatoryView,
  type PersonPermanence,
} from "./permanence-pure";
import { parseGeneral, parseMandatory, parseResults } from "./snapshot-pure";

// Snapshots persistidos (ADR-036 regla 5): el recompute corre por outbox con clave por término o por
// persona, toma el lock del término antes de leer los hechos y salta los términos cerrados; las
// filas congeladas no cambian. Las listas (cumplimiento, líder, junta, cierre) leen de aquí.

export interface SnapshotView {
  termId: string;
  personId: string;
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  isNew: boolean;
  probation: boolean;
  expulsionWarning: boolean;
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
    expulsionWarning: row.expulsionWarning,
    generalTotal: row.generalTotal,
    generalMax: row.generalMax,
    general: parseGeneral(row.general),
    results: parseResults(row.results),
    mandatory: parseMandatory(row.mandatory),
    computedAt: row.computedAt,
    frozenAt: row.frozenAt,
  };
}

/** El snapshot como resultado calculado, para las pantallas que aceptan ambos. */
export function snapshotToResult(view: SnapshotView): PersonPermanence {
  return {
    personId: view.personId,
    status: view.status,
    isNew: view.isNew,
    probation: view.probation,
    expulsionWarning: view.expulsionWarning,
    evaluated: view.status === "ACTIVE" && view.results.length > 0,
    general: view.general,
    generalTotal: view.generalTotal,
    generalMax: view.generalMax,
    results: view.results,
    mandatory: view.mandatory,
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

export async function listSnapshots(termId: string): Promise<SnapshotView[]> {
  const rows = await getDb()
    .select()
    .from(permanenceSnapshot)
    .where(eq(permanenceSnapshot.termId, termId));
  return rows.map(toView);
}

/**
 * Recalcula los snapshots del término (o solo de una persona) bajo el lock del término. Devuelve
 * cuántas filas escribió; 0 si el término no existe o ya cerró su permanencia.
 */
export async function recomputeSnapshots(
  termId: string,
  personId: string | null = null,
  now = new Date(),
): Promise<number> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`permanence:${termId}`}))`);
    const facts = await loadTermFacts(termId);
    if (!facts || facts.term.permanenceClosedAt) {
      return 0;
    }
    const people = await loadPeopleFacts(facts, personId ? [personId] : undefined);
    let written = 0;
    for (const person of people) {
      const result = computePerson(facts, person, now);
      const values = {
        termId,
        personId: person.personId,
        status: person.status,
        isNew: result.isNew,
        probation: result.probation,
        expulsionWarning: result.expulsionWarning,
        generalTotal: result.generalTotal,
        generalMax: result.generalMax,
        general: result.general,
        results: result.results,
        mandatory: result.mandatory,
        computedAt: now,
      };
      await tx
        .insert(permanenceSnapshot)
        .values(values)
        .onConflictDoUpdate({
          target: [permanenceSnapshot.termId, permanenceSnapshot.personId],
          set: values,
          setWhere: isNull(permanenceSnapshot.frozenAt),
        });
      written += 1;
    }
    if (!personId) {
      // Quien ya no tiene pertenencia en el término sale del snapshot (salvo que esté congelado).
      const keep = people.map((person) => person.personId);
      await tx
        .delete(permanenceSnapshot)
        .where(
          and(
            eq(permanenceSnapshot.termId, termId),
            isNull(permanenceSnapshot.frozenAt),
            keep.length > 0 ? notInArray(permanenceSnapshot.personId, keep) : undefined,
          ),
        );
    } else if (people.length === 0) {
      await tx
        .delete(permanenceSnapshot)
        .where(
          and(
            eq(permanenceSnapshot.termId, termId),
            eq(permanenceSnapshot.personId, personId),
            isNull(permanenceSnapshot.frozenAt),
          ),
        );
    }
    return written;
  });
}

/** Congela los snapshots del término al aplicar el cierre (ADR-036 regla 9). */
export async function freezeSnapshots(ctx: CommandContext, termId: string, at = new Date()) {
  await ctx.tx
    .update(permanenceSnapshot)
    .set({ frozenAt: at })
    .where(and(eq(permanenceSnapshot.termId, termId), isNull(permanenceSnapshot.frozenAt)));
}

/** Recalcular ahora desde el admin: encola el recompute del término con su clave (ADR-036 regla 5). */
export function requestRecomputeAs(actor: Actor, termId: string): Promise<void> {
  return runCommand(actor, (ctx) =>
    ctx.emit({
      type: "permanence.recompute",
      payload: { termId },
      dedupeKey: `permanence:${termId}:*`,
    }),
  );
}
