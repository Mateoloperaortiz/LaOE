import { hasWeeklyAvailability } from "@/modules/availability";
import { listMyEntries, listOpenCalls, listRequestsByPerson } from "@/modules/crm";
import {
  listChallengesForMember,
  listPendingSurveys,
  listPendingVotes,
} from "@/modules/participation";
import { listGroupIdsOf, listGroupRefs } from "@/modules/permanence";
import { sortTodo, type TodoItem } from "./today-items";

// «Te toca» de «Hoy» (ADR-160 regla 2, tramo M2): lo pendiente de varios módulos en una sola lista,
// leído de su API pública. Solo lee: cada elemento lleva a su pantalla de siempre.
// - Evidencias: los retos de evidencia abiertos que la persona todavía no entregó.
// - Disponibilidad: la de la semana, mientras no la haya marcado en el término.
// - Convocatorias: las abiertas de grupos donde no está ni se postuló.
// - Solicitudes: las suyas que siguen en revisión.
// - Encuestas: las que todavía puede responder, abiertas por su id con la sesión (ADR-174).
// Los pasos de bienvenida los pinta la página con su botón.

export async function loadTodo(
  personId: string,
  termId: string | null,
  participationAllowed: boolean,
  now = new Date(),
): Promise<TodoItem[]> {
  const active = participationAllowed && termId !== null;
  const [challenges, availabilityDone, openCalls, myEntries, myGroups, requests, surveys, votes] =
    await Promise.all([
      active ? listChallengesForMember(personId, termId, now) : [],
      active ? hasWeeklyAvailability(personId, termId) : true,
      active ? listOpenCalls(termId, now) : [],
      active ? listMyEntries(personId) : [],
      active ? listGroupIdsOf(personId) : [],
      listRequestsByPerson(personId),
      participationAllowed ? listPendingSurveys(personId, now) : [],
      participationAllowed ? listPendingVotes(personId) : [],
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
    ...surveys.map((survey) => ({
      id: `encuesta-${survey.inviteId}`,
      kind: "survey" as const,
      subject: survey.occasionTitle,
      href: `/app/encuestas/${survey.inviteId}`,
      due: survey.due,
    })),
    // Una votación abierta en una asamblea donde está presente (ADR-180 regla 4): va de primera.
    ...votes.map((vote) => ({
      id: `votacion-${vote.occasionId}`,
      kind: "vote" as const,
      subject: vote.occasionTitle,
      href: `/app/asamblea/${vote.occasionId}`,
      due: now,
    })),
  ]);
}
