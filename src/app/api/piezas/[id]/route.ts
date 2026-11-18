import { creativeAccess } from "@/app/_authz/creative";
import { creativeFileUrl } from "@/modules/comms";
import { getActor } from "@/modules/identity";
import { reviewId } from "@/shared/adapters/review-file";

export async function GET(_request: Request, { params }: RouteContext<"/api/piezas/[id]">) {
  const headers = { "Cache-Control": "private, no-store" };
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401, headers });
  const { id } = await params;
  if (!reviewId.safeParse(id).success) return new Response(null, { status: 404, headers });
  const url = await creativeFileUrl(id, await creativeAccess(actor));
  return url
    ? new Response(null, { status: 302, headers: { ...headers, location: url } })
    : new Response(null, { status: 404, headers });
}
