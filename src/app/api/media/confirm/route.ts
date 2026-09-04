import { confirmUploadAs, confirmUploadSchema } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Paso 2 de la subida directa (ADR-022): comprueba el objeto, registra el medio y encola las variantes.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = confirmUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  if (!actor.isAdmin && parsed.data.purpose !== "photo") {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  try {
    const result = await confirmUploadAs(
      { personId: actor.personId, ip: await clientIp() },
      parsed.data,
    );
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
