import { hasWeeklyAvailability } from "@/modules/availability";
import { listMyEntries, listOpenCalls, listRequestsByPerson } from "@/modules/crm";
import { listChallengesForMember } from "@/modules/participation";
import { listGroupIdsOf, listGroupRefs } from "@/modules/permanence";
import { sortTodo, type TodoItem } from "./today-items";

// «Te toca» de «Hoy» (ADR-160 regla 2, tramo M2): lo pendiente de varios módulos en una sola lista,
// leído de su API pública. Solo lee: cada elemento lleva a su pantalla de siempre.
// - Evidencias: los retos de evidencia abiertos que la persona todavía no entregó.
// - Disponibilidad: la de la semana, mientras no la haya marcado en el término.
// - Convocatorias: las abiertas de grupos donde no está ni se postuló.
// - Solicitudes: las suyas que siguen en revisión.
// Las encuestas no entran todavía: su enlace lleva un token que la casa solo guarda cifrado, y llegar a
// ellas desde Mi OE pide otra forma de abrirlas. Los pasos de bienvenida los pinta la página con su botón.

export async function loadTodo(
  personId: string,
  termId: string | null,
  participationAllowed: boolean,
  now = new Date(),
): Promise<TodoItem[]> {
  const active = participationAllowed && termId !== null;
  const [challenges, availabilityDone, openCalls, myEntries, myGroups, requests] =
    await Promise.all([
      active ? listChallengesForMember(personId, termId, now) : [],
      active ? hasWeeklyAvailability(personId, termId) : true,
      active ? listOpenCalls(termId, now) : [],
      active ? listMyEntries(personId) : [],
      active ? listGroupIdsOf(personId) : [],
      listRequestsByPerson(personId),
    ]);
  const applied = new Set(myEntries.map((entry) => entry.callId));
  const inGroup = new Set(myGroups);
  const calls = openCalls.filter((call) => !applied.has(call.id) && !inGroup.has(call.groupId));
  const groups = await listGroupRefs(calls.map((call) => call.groupId));
  return sortTodo([
    ...challenges
      .filter(
        (item) => item.kind === "EVIDENCE" && item.state === "OPEN" && item.status === "AVAILABLE",
      )
      .map((item) => ({
        id: `reto-${item.id}`,
        kind: "evidence" as const,
        subject: item.title,
        href: `/app/gh-points/retos/${item.id}`,
        due: item.closesAt,
      })),
    ...(availabilityDone
      ? []
      : [
          {
            id: "disponibilidad",
            kind: "availability" as const,
            subject: "",
            href: "/app/disponibilidad",
            due: null,
          },
        ]),
    ...calls.map((call) => ({
      id: `convocatoria-${call.id}`,
      kind: "call" as const,
      subject: groups.get(call.groupId)?.name ?? call.title,
      href: "/app/convocatorias",
      due: call.closesAt,
    })),
    ...requests
      .filter((request) => request.status === "PENDING")
      .map((request) => ({
        id: `solicitud-${request.id}`,
        kind: "request" as const,
        subject: request.kindLabel,
        href: "/app/solicitudes",
        due: null,
      })),
  ]);
}
