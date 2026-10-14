"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { sendTemplateTestAs } from "@/modules/comms";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";

// Vista previa de una plantilla (ADR-038 regla 8): "Enviarme una prueba" manda la plantilla al correo
// del actor por el mailer transaccional y vuelve con lo que contestó el proveedor.

const idSchema = z.string().regex(/^[a-z0-9]+$/);

export async function sendTestAction(formData: FormData): Promise<void> {
  const templateId = idSchema.parse(formData.get("templateId"));
  const back = `/admin/plantillas/${templateId}`;
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(back)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  const result = await sendTemplateTestAs(await actorContext(actor), templateId);
  if (!result) {
    redirect(back);
  }
  // La pantalla dice lo que contestó el proveedor (ADR-118 regla 14).
  const outcome = result.sent ? "prueba" : "pruebaRechazada";
  redirect(`${back}?${outcome}=${encodeURIComponent(result.to)}`);
}
