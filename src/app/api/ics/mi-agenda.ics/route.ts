import { getEnv } from "@/env";
import { buildIcs, listMemberEditionsForIcs } from "@/modules/events";
import { resolveCalendarToken } from "@/modules/identity";
import { agendaEntries, listAgendaForPerson } from "@/modules/participation";
import { getMembershipRef } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";

// Calendario personal (ADR-038 regla 12): sin sesión, con el token de Ajustes; solo activos y
// honorarios. Compone las ediciones de miembros y las ocasiones del término que le tocan a la persona.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const personId = await resolveCalendarToken(token);
  if (!personId) {
    return new Response("No existe", { status: 404 });
  }
  const membership = await getMembershipRef(personId);
  if (!membership || (membership.status !== "ACTIVE" && membership.status !== "HONORARY")) {
    return new Response("No existe", { status: 404 });
  }
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const host = new URL(base).host;
  const term = await getCurrentTerm();
  const [editions, occasions] = await Promise.all([
    listMemberEditionsForIcs(),
    term
      ? listAgendaForPerson({
          personId,
          termId: term.id,
          isNew: membership.firstTermId === term.id,
        })
      : Promise.resolve([]),
  ]);
  const body = buildIcs({
    name: t("T-1085"),
    prodId: "-//Organizacion Estudiantil EAFIT//Casa digital//ES",
    events: agendaEntries(
      occasions.map((row) => ({
        id: row.id,
        publicId: row.publicId,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        updatedAt: row.updatedAt,
      })),
      editions.map((edition) => ({
        id: edition.id,
        name: edition.name,
        eventName: edition.event.name,
        eventSlug: edition.event.slug,
        slug: edition.slug,
        description: edition.description,
        location: edition.location,
        startsAt: edition.startsAt,
        endsAt: edition.endsAt,
        updatedAt: edition.updatedAt,
      })),
      base,
      host,
    ),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="mi-agenda-oe.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
