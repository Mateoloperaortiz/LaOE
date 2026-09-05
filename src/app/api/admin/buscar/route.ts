import { searchOrganizations } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { searchOccasions } from "@/modules/participation";
import { searchCommittees, searchPeople } from "@/modules/people";
import type { PaletteResult } from "@/shared/admin-kit";
import { tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Paleta ⌘K: personas, comités, ocasiones y organizaciones por similitud (pg_trgm). Los correos solo los ve ADMIN (02-crm.md).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ results: [] }, { status: 401 });
  }
  const canSearch =
    actor.isAdmin || actor.permissions.some((item) => item.code === "COMMITTEE_LEADER");
  if (!canSearch) {
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
    actor.isAdmin ? searchOrganizations(q) : Promise.resolve([]),
  ]);
  const kindLabels = tList("T-949");
  const results: PaletteResult[] = [
    ...people.map((item) => ({
      type: "person",
      id: item.id,
      title: item.fullName,
      subtitle: actor.isAdmin ? item.email : null,
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
      subtitle: `${kindLabels[["COMPANY", "EAFIT_UNIT", "STUDENT_GROUP", "OTHER"].indexOf(item.kind)] ?? item.kind} · ${item.contactCount}`,
      href: `/admin/organizaciones/${item.id}`,
    })),
  ];
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
