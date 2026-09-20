import { prepareDocumentSchema, prepareDocumentUpload } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";

// Paso 1 de la subida de un PDF de normativa (ADR-034 regla 9): ADMIN pide un POST prefirmado.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  if (!actor.isAdmin) {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  const parsed = prepareDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  try {
    const upload = await prepareDocumentUpload(parsed.data);
    return Response.json(upload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
