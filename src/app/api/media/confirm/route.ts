import { actorContext } from "@/app/_lib/actor";
import { confirmUploadAs, confirmUploadSchema, type UploadScope } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";

// Paso 2 de la subida directa (ADR-022): comprueba el objeto, registra el medio y encola las variantes.
// La ruta declara el alcance con la sesión; qué clave se confirma con él lo decide el comando
// (ADR-113 regla 5), no el propósito que mande el cliente.

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
  // Respuesta temprana para quien declara un medio sin ser ADMIN; la regla la aplica el comando.
  if (!actor.isAdmin && parsed.data.purpose !== "photo") {
    return Response.json({ error: "Solo ADMIN" }, { status: 403 });
  }
  const scope: UploadScope = actor.isAdmin ? { by: "ADMIN" } : { by: "SELF" };
  try {
    const result = await confirmUploadAs(await actorContext(actor), parsed.data, scope);
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
