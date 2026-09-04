import { prepareUpload, prepareUploadSchema } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";

// Paso 1 de la subida directa (ADR-022): ADMIN pide un POST prefirmado con tipo y tamaño acotados.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = prepareUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  // La foto propia la sube cualquier persona con sesión (ADR-034 regla 8); el resto, ADMIN.
  if (!actor.isAdmin && parsed.data.purpose !== "photo") {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  try {
    const upload = await prepareUpload(parsed.data, { personId: actor.personId });
    return Response.json(upload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
