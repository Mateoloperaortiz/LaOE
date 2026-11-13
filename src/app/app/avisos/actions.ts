"use server";

import { redirect } from "next/navigation";
import { formText } from "@/app/_lib/form";
import { markInboxRead, openInboxItem } from "@/modules/comms";
import { requireActor } from "@/modules/identity";

// Las acciones del centro de avisos (ADR-166 regla 4): abrir un aviso lo marca leído y lleva a su
// enlace; «Marcar todo como leído» toca solo lo de la persona.

export async function openInboxItemAction(formData: FormData): Promise<void> {
  const actor = await requireActor("/app/avisos");
  const opened = await openInboxItem(actor.personId, formText(formData, "id"));
  redirect(opened?.href ?? "/app/avisos");
}

export async function markAllReadAction(): Promise<void> {
  const actor = await requireActor("/app/avisos");
  await markInboxRead(actor.personId);
  redirect("/app/avisos");
}
