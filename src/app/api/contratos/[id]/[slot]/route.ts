import { adminAreaRoles } from "@/app/_authz/admin-area";
import { CONTRACT_FILE_SLOTS, contractFileUrl } from "@/modules/finance";
import { getActor } from "@/modules/identity";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/contratos/[id]/[slot]">,
) {
  const headers = { "Cache-Control": "private, no-store" };
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401, headers });
  const { id, slot } = await params;
  const field = CONTRACT_FILE_SLOTS.find((value) => value === slot);
  if (!field || !/^[a-z][a-z0-9]{23}$/.test(id))
    return new Response(null, { status: 404, headers });
  const roles = await adminAreaRoles(actor);
  const url = await contractFileUrl(id, field, {
    all:
      roles.isAdmin ||
      roles.boardSeats.some((s) => s.seat === "PRESIDENT" || s.seat === "VP_FINANCE"),
    committees: roles.committees
      .filter((c) => c.capabilities.includes("FINANCE"))
      .map((c) => c.committee.id),
  });
  return url
    ? new Response(null, { status: 302, headers: { ...headers, location: url } })
    : new Response(null, { status: 404, headers });
}
