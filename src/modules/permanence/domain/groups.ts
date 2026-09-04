import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { workGroup, workGroupEvaluator } from "../schema";

// Grupos de trabajo (ADR-036 regla 6). Este archivo arranca con las lecturas de acceso; los
// comandos llegan en el tramo F4-T4.

export interface GroupRef {
  id: string;
  name: string;
  kind: (typeof workGroup.$inferSelect)["kind"];
  code: string | null;
}

export interface MyGroupRoles {
  /** Grupos que la persona lidera en el término. */
  leads: GroupRef[];
  /** Grupos que la persona evalúa en el término. */
  evaluates: GroupRef[];
}

/** Roles derivados de los datos (no permisos técnicos): líder o evaluador de grupos del término. */
export async function listMyGroupRoles(personId: string, termId: string): Promise<MyGroupRoles> {
  const db = getDb();
  const columns = {
    id: workGroup.id,
    name: workGroup.name,
    kind: workGroup.kind,
    code: workGroup.code,
  };
  const leads = await db
    .select(columns)
    .from(workGroup)
    .where(and(eq(workGroup.termId, termId), eq(workGroup.leaderPersonId, personId)))
    .orderBy(asc(workGroup.name));
  const evaluatorRows = await db
    .select({ groupId: workGroupEvaluator.groupId })
    .from(workGroupEvaluator)
    .where(eq(workGroupEvaluator.personId, personId));
  const evaluates =
    evaluatorRows.length === 0
      ? []
      : await db
          .select(columns)
          .from(workGroup)
          .where(
            and(
              eq(workGroup.termId, termId),
              inArray(
                workGroup.id,
                evaluatorRows.map((row) => row.groupId),
              ),
            ),
          )
          .orderBy(asc(workGroup.name));
  return { leads, evaluates };
}
