"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sendTemplateTestAs } from "@/modules/comms";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";

// Vista previa de una plantilla (ADR-038 regla 8): "Enviarme una prueba" manda la plantilla al correo
// del actor por el mailer transaccional.

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
  const result = await sendTemplateTestAs({ personId: actor.personId }, templateId);
  redirect(result ? `${back}?prueba=${encodeURIComponent(result.to)}` : back);
}
