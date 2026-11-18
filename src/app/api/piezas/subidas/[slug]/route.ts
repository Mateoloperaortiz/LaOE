import { committeeAccess } from "@/app/_authz/committee";
import { prepareCreativeUpload } from "@/modules/comms";
import { getActor } from "@/modules/identity";
import { reviewUpload } from "@/shared/adapters/review-file";
import { t } from "@/shared/copy";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/piezas/subidas/[slug]">,
) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const access = await committeeAccess(actor, (await params).slug);
  if (!access?.capabilities.has("BOARD")) return new Response(null, { status: 403 });
  const parsed = reviewUpload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: t("T-5180") }, { status: 400 });
  const upload = await prepareCreativeUpload(
    actor.personId,
    access.roster.committee.id,
    parsed.data,
  );
  return Response.json(upload, { headers: { "Cache-Control": "no-store" } });
}
