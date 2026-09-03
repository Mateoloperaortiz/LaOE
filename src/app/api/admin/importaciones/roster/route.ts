import { getActor } from "@/modules/identity";
import { createRosterPreviewAs, ROSTER_MAX_BYTES } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";

// Paso 1 del asistente del roster (ADR-034): el archivo (menos de 5 MB) llega al servidor, que lo guarda
// en el bucket privado, lo lee y deja la vista previa en un ImportJob.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  if (!actor.isAdmin) {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const termId = form?.get("termId");
  if (!(file instanceof File) || typeof termId !== "string" || !termId) {
    return Response.json({ error: t("T-488") }, { status: 400 });
  }
  if (file.size === 0 || file.size > ROSTER_MAX_BYTES) {
    return Response.json({ error: t("T-488") }, { status: 400 });
  }
  try {
    const result = await createRosterPreviewAs(
      { personId: actor.personId, ip: await clientIp() },
      {
        filename: file.name,
        contentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        termId,
      },
    );
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
