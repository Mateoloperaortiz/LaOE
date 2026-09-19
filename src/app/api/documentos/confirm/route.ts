import { actorContext } from "@/app/_lib/actor";
import { confirmDocumentAs, confirmDocumentSchema } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";

// Paso 2 de la subida de un PDF: comprueba el objeto, calcula el sha256 y registra el documento.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  if (!actor.isAdmin) {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  const parsed = confirmDocumentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  try {
    const result = await confirmDocumentAs(await actorContext(actor), parsed.data);
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
