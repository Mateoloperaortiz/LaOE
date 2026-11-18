import { committeeAccess } from "@/app/_authz/committee";
import { contractUploadSchema, prepareContractUpload } from "@/modules/finance";
import { getActor } from "@/modules/identity";
import { t } from "@/shared/copy";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/contratos/subidas/[slug]">,
) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const access = await committeeAccess(actor, (await params).slug);
  if (!access?.capabilities.has("FINANCE")) return new Response(null, { status: 403 });
  const input = contractUploadSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: t("T-5174") }, { status: 400 });
  const upload = await prepareContractUpload(
    actor.personId,
    { committeeId: access.roster.committee.id },
    input.data,
  );
  return Response.json(upload, { headers: { "Cache-Control": "no-store" } });
}
