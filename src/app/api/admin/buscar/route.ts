import { adminAreaRoles } from "@/app/_authz/admin-area";
import { ORGANIZATION_KINDS, searchOrganizations } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { searchOccasions } from "@/modules/participation";
import { areasFor, searchCommitteeMembers, searchCommittees, searchPeople } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import type { PaletteResult } from "@/shared/admin-kit";
import { tLabels } from "@/shared/copy";
import { stripAccents } from "@/shared/lib/accents";
import { formatDateTime } from "@/shared/lib/dates";

// Paleta ⌘K (ADR-165, que enmienda ADR-072 regla 6): responde a todos los roles de la Operación, cada
// uno dentro de su alcance. ADMIN busca como siempre: personas también por correo, comités, ocasiones
// y organizaciones. La dirección de un comité busca a la gente de los comités donde ve «Personas», solo
// por nombre y sin correo, y sus propios comités. La junta, los grupos y The Games no buscan aquí: sus
// destinos los busca la paleta en el navegador.

export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "cache-control": "no-store" } };

function folded(value: string): string {
  return stripAccents(value).toLowerCase();
}

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ results: [] }, { status: 401 });
  }
  const roles = await adminAreaRoles(actor);
  if (!roles.any) {
    return Response.json({ results: [] }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return Response.json({ results: [] }, NO_STORE);
  }
  if (!roles.isAdmin) {
    return Response.json({ results: await scopedResults(roles, q) }, NO_STORE);
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
  return Response.json({ results }, NO_STORE);
}

/** Lo que busca quien no es ADMIN: la gente y los comités de su alcance (ADR-165 reglas 4 y 5). */
async function scopedResults(
  roles: Awaited<ReturnType<typeof adminAreaRoles>>,
  q: string,
): Promise<PaletteResult[]> {
  if (roles.committees.length === 0) {
    return [];
  }
  const withPeople = roles.committees.filter((item) =>
    areasFor(item.capabilities).includes("personas"),
  );
  const term = withPeople.length > 0 ? await getCurrentTerm() : null;
  const members = term
    ? await searchCommitteeMembers(
        q,
        withPeople.map((item) => item.committee.id),
        term.id,
      )
    : [];
  const byId = new Map(roles.committees.map((item) => [item.committee.id, item.committee]));
  const wanted = folded(q);
  return [
    ...members.flatMap((item) => {
      const committee = byId.get(item.committeeId);
      return committee
        ? [
            {
              type: "person",
              id: `${item.id}-${committee.id}`,
              title: item.fullName,
              subtitle: committee.name,
              href: `/admin/comites/${committee.slug}?area=personas#persona-${item.id}`,
            },
          ]
        : [];
    }),
    ...roles.committees
      .filter((item) => folded(item.committee.name).includes(wanted))
      .map((item) => ({
        type: "committee",
        id: item.committee.id,
        title: item.committee.name,
        subtitle: item.committee.slug,
        href: `/admin/comites/${item.committee.slug}`,
      })),
  ];
}
