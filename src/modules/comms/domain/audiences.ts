import { listActiveMemberRefs, listTermCommitteeMembers } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";

// Quién recibe cada aviso (ADR-038 reglas 6 y 7): comms resuelve la audiencia con lecturas de people.
// Quien está en licencia no tiene acceso a Mi OE y no recibe push; los anonimizados tampoco.

/** Activos y honorarios: la audiencia de un anuncio general, una convocatoria o un recordatorio general. */
export async function membersAudience(): Promise<string[]> {
  const refs = await listActiveMemberRefs(true);
  return refs.filter((item) => !item.anonymized).map((item) => item.personId);
}

/** Los miembros del comité en el término vigente (activos y honorarios, sin salida registrada). */
export async function committeeAudience(committeeId: string): Promise<string[]> {
  const term = await getCurrentTerm();
  if (!term) {
    return [];
  }
  const rows = await listTermCommitteeMembers(term.id);
  return rows
    .filter(
      (row) =>
        row.committeeId === committeeId &&
        row.leftAt === null &&
        (row.status === "ACTIVE" || row.status === "HONORARY"),
    )
    .map((row) => row.personId);
}
