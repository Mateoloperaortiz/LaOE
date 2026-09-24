import "server-only";
import { notFound, redirect } from "next/navigation";
import {
  type CompetitionActor,
  type CompetitionRoles,
  type CompetitionRow,
  competitionRoles,
  getCompetition,
} from "@/modules/competition";
import { type Actor, canOperate, requireActor } from "@/modules/identity";
import { clientIp } from "@/shared/lib/request";

// Quién entra a The Games en el admin (ADR-089 regla 10): ADMIN, la Dirección de The Games de la
// edición, los operadores y los jueces asignados. El dominio de `competition` lo vuelve a leer dentro
// de cada transacción; esto solo decide qué página se muestra.

export interface CompetitionAccess {
  actor: Actor;
  competition: CompetitionRow;
  roles: CompetitionRoles;
  /** El actor que reciben los comandos, con la IP del request para la auditoría (ADR-082). */
  commandActor: () => Promise<CompetitionActor>;
}

async function access(competitionId: string, returnTo: string): Promise<CompetitionAccess> {
  const actor = await requireActor(returnTo);
  const competition = await getCompetition(competitionId);
  if (!competition) notFound();
  const roles = canOperate(actor)
    ? await competitionRoles(actor, competition.id)
    : { operator: false, judgeBaseIds: [] };
  return {
    actor,
    competition,
    roles,
    commandActor: async () => ({
      personId: actor.personId,
      isAdmin: actor.isAdmin,
      ip: await clientIp(),
    }),
  };
}

/** Operador de la competencia; si no lo es, a su pantalla de juez o fuera del admin. */
export async function requireCompetitionOperator(
  competitionId: string,
  returnTo: string,
): Promise<CompetitionAccess> {
  const result = await access(competitionId, returnTo);
  if (!result.roles.operator) {
    redirect(
      result.roles.judgeBaseIds.length > 0 ? `/admin/the-games/${competitionId}/juez` : "/admin",
    );
  }
  return result;
}

/** Operador o juez de la competencia. */
export async function requireCompetitionStaff(
  competitionId: string,
  returnTo: string,
): Promise<CompetitionAccess> {
  const result = await access(competitionId, returnTo);
  if (!result.roles.operator && result.roles.judgeBaseIds.length === 0) redirect("/admin");
  return result;
}
