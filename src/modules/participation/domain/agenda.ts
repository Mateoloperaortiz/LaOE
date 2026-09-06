import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listTermRoster } from "@/modules/people";
import { occasion } from "../schema";
import type { OccasionRow } from "./occasions";

// La agenda de una persona (ADR-038 regla 12): las ocasiones del término que le tocan, para el ICS
// personal. No incluye borradores ni canceladas.

export interface PersonAgendaContext {
  personId: string;
  termId: string;
  /** Entró en este término: ve también las ocasiones solo para nuevos. */
  isNew: boolean;
}

/**
 * Ocasiones abiertas o cerradas del término que son generales (sin comité), asambleas, o de los
 * comités vivos de la persona; las de solo nuevos únicamente si la persona es nueva.
 */
export async function listAgendaForPerson(context: PersonAgendaContext): Promise<OccasionRow[]> {
  const roster = await listTermRoster(context.termId, [context.personId]);
  const committees = new Set(
    roster.filter((row) => row.leftAt === null).map((row) => row.committeeId),
  );
  const rows = await getDb()
    .select()
    .from(occasion)
    .where(and(eq(occasion.termId, context.termId), inArray(occasion.status, ["OPEN", "CLOSED"])))
    .orderBy(asc(occasion.startsAt));
  return rows.filter((row) => {
    if (row.committeeId && !committees.has(row.committeeId)) {
      return false;
    }
    if (row.newMembersOnly && !context.isNew) {
      return false;
    }
    return true;
  });
}
