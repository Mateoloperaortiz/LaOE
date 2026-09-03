import { getActor } from "@/modules/identity";
import { searchCommittees, searchPeople } from "@/modules/people";
import type { PaletteResult } from "@/shared/admin-kit";

// Paleta ⌘K: personas y comités por similitud (pg_trgm). Los correos solo los ve ADMIN (02-crm.md).

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
  const [people, committees] = await Promise.all([searchPeople(q), searchCommittees(q)]);
  const results: PaletteResult[] = [
    ...people.map((item) => ({
      type: "person",
      id: item.id,
      title: item.fullName,
      subtitle: actor.isAdmin ? item.email : null,
      href: `/admin/permisos?q=${encodeURIComponent(item.email)}`,
    })),
    ...committees.map((item) => ({
      type: "committee",
      id: item.id,
      title: item.name,
      subtitle: item.slug,
      href: `/admin/comites?editar=${item.id}`,
    })),
  ];
  return Response.json({ results }, { headers: { "cache-control": "no-store" } });
}
