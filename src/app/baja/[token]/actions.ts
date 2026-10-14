"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { unsubscribeByToken } from "@/modules/comms";
import { clientIp } from "@/shared/lib/request";

// Baja de campañas por correo (ADR-038 regla 8): sin sesión, con el token del pie del correo; solo
// apaga `emailCampaigns` de esa persona. No hay actor de sesión que armar con `actorContext`: la IP
// del request se lee con la misma `clientIp` del kit y va a la auditoría (ADR-123 regla 2).

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export async function unsubscribeAction(formData: FormData): Promise<void> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) {
    redirect("/baja/invalido?estado=invalido");
  }
  const ok = await unsubscribeByToken(parsed.data, await clientIp());
  redirect(`/baja/${parsed.data}?estado=${ok ? "listo" : "invalido"}`);
}
