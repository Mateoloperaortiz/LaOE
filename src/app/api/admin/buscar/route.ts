import { ORGANIZATION_KINDS, searchOrganizations } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { searchOccasions } from "@/modules/participation";
import { searchCommittees, searchPeople } from "@/modules/people";
import type { PaletteResult } from "@/shared/admin-kit";
import { tLabels } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Paleta ⌘K: personas, comités, ocasiones y organizaciones por similitud (pg_trgm). Es solo de ADMIN,
// como el resto del kit (ADR-035 regla 15, ADR-072): busca en toda la tabla de personas, también por
// correo, así que otro rol no la usa ni para saber si un correo existe.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ results: [] }, { status: 401 });
  }
  if (!actor.isAdmin) {
    return Response.json({ results: [] }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] });
  }
  const [people, committees, occasions, organizations] = await Promise.all([
    searchPeople(q),
    searchCommittees(q),
    searchOccasions(q),
    searchOrganizations(q),
  ]);
  const kindLabels: Readonly<Record<string, string>> = tLabels("T-949", ORGANIZATION_KINDS);
  const results: PaletteResult[] = [
    ...people.map((item) => ({
      type: "person",
      id: item.id,
      title: item.fullName,
      subtitle: item.email,
      href: `/admin/personas/${item.id}`,
    })),
    ...committees.map((item) => ({
      type: "committee",
      id: item.id,
      title: item.name,
      subtitle: item.slug,
      href: `/admin/comites?editar=${item.id}`,
    })),
    ...occasions.map((item) => ({
      type: "occasion",
      id: item.id,
      title: item.title,
      subtitle: formatDateTime(item.startsAt),
      href: `/admin/ocasiones/${item.id}`,
    })),
    ...organizations.map((item) => ({
      type: "organization",
      id: item.id,
      title: item.name,
      subtitle: `${kindLabels[item.kind] ?? item.kind} · ${item.contactCount}`,
      href: `/admin/organizaciones/${item.id}`,
    })),
  ];
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
