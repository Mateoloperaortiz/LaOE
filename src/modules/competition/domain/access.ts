import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Actor, Executor } from "@/db/tx";
import { getMembershipRef, isMacroeventDirector, listDirectedEditionIds } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { competition, competitionStaff } from "../schema";

// Quién opera The Games (ADR-089 regla 10). No es un permiso técnico: sale de los datos.
// - Operador: ADMIN; la titular o codirección del cargo THE_GAMES de la mesa de la edición; o alguien
//   asignado como OPERATOR en competition_staff.
// - Juez: una fila JUDGE en competition_staff, ligada a una base.
// En los dos casos, con una membresía que pueda operar (ACTIVE u HONORARY). Los comandos releen todo
// esto dentro de su transacción aunque la página ya lo haya comprobado (ADR-072).

export const THE_GAMES_ROLE_CODE = "THE_GAMES";

const OPERATING_STATUSES = new Set(["ACTIVE", "HONORARY"]);

/** Quién ejecuta un comando de la competencia: `isAdmin` lo decide la sesión en src/app. */
export interface CompetitionActor extends Actor {
  personId: string;
  isAdmin: boolean;
}

export interface CompetitionRoles {
  operator: boolean;
  /** Bases de las que la persona es jueza. */
  judgeBaseIds: string[];
}

const NONE: CompetitionRoles = { operator: false, judgeBaseIds: [] };

/** Los roles de una persona en una competencia, leídos con `exec` (la transacción, si la hay). */
export async function competitionRoles(
  actor: Pick<CompetitionActor, "personId" | "isAdmin">,
  competitionId: string,
  exec: Executor = getDb(),
): Promise<CompetitionRoles> {
  const [row] = await exec
    .select({ editionId: competition.editionId })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1);
  if (!row) return NONE;
  const membership = await getMembershipRef(actor.personId, exec);
  if (!membership || !OPERATING_STATUSES.has(membership.status)) return NONE;
  const staff = await exec
    .select({ baseId: competitionStaff.baseId })
    .from(competitionStaff)
    .where(
      and(
        eq(competitionStaff.competitionId, competitionId),
        eq(competitionStaff.personId, actor.personId),
      ),
    );
  const judgeBaseIds = staff.flatMap((item) => (item.baseId ? [item.baseId] : []));
  const operator =
    actor.isAdmin ||
    staff.some((item) => item.baseId === null) ||
    (await isMacroeventDirector(actor.personId, row.editionId, THE_GAMES_ROLE_CODE, exec));
  return { operator, judgeBaseIds };
}

/** Lanza si la persona no opera la competencia; un id ajeno se responde como inexistente. */
export async function assertOperator(
  actor: CompetitionActor,
  competitionId: string,
  exec: Executor,
): Promise<void> {
  const roles = await competitionRoles(actor, competitionId, exec);
  if (!roles.operator) throw new DomainError(t("T-2764"));
}

/** Operador, o juez de esa base. */
export async function assertCanRecordAt(
  actor: CompetitionActor,
  competitionId: string,
  baseId: string,
  exec: Executor,
): Promise<{ operator: boolean }> {
  const roles = await competitionRoles(actor, competitionId, exec);
  if (roles.operator) return { operator: true };
  if (roles.judgeBaseIds.includes(baseId)) return { operator: false };
  throw new DomainError(t("T-2764"));
}

export interface MyCompetitionRole {
  competitionId: string;
  slug: string;
  name: string;
  operator: boolean;
  judgeBaseIds: string[];
}

/** Las competencias en las que la persona tiene algún rol, para el área de administración. */
export async function listMyCompetitionRoles(
  actor: Pick<CompetitionActor, "personId" | "isAdmin">,
): Promise<MyCompetitionRole[]> {
  const db = getDb();
  const membership = await getMembershipRef(actor.personId);
  if (!membership || !OPERATING_STATUSES.has(membership.status)) return [];
  const editionIds = await listDirectedEditionIds(actor.personId, THE_GAMES_ROLE_CODE);
  const staff = await db
    .select({ competitionId: competitionStaff.competitionId, baseId: competitionStaff.baseId })
    .from(competitionStaff)
    .where(eq(competitionStaff.personId, actor.personId));
  const staffIds = [...new Set(staff.map((item) => item.competitionId))];
  const conditions = [
    ...(editionIds.length > 0 ? [inArray(competition.editionId, editionIds)] : []),
    ...(staffIds.length > 0 ? [inArray(competition.id, staffIds)] : []),
  ];
  if (!actor.isAdmin && conditions.length === 0) return [];
  const rows = await db
    .select({
      id: competition.id,
      slug: competition.slug,
      name: competition.name,
      editionId: competition.editionId,
    })
    .from(competition)
    .where(actor.isAdmin ? undefined : or(...conditions))
    .orderBy(desc(competition.createdAt));
  return rows.map((row) => {
    const own = staff.filter((item) => item.competitionId === row.id);
    return {
      competitionId: row.id,
      slug: row.slug,
      name: row.name,
      operator:
        actor.isAdmin ||
        editionIds.includes(row.editionId) ||
        own.some((item) => item.baseId === null),
      judgeBaseIds: own.flatMap((item) => (item.baseId ? [item.baseId] : [])),
    };
  });
}
