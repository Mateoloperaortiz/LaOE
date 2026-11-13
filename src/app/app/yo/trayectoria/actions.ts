"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { publishCredentialAs, revokeCredentialAs } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";

// Publicar y dejar de publicar un elemento de la trayectoria (ADR-171 regla 2): solo lo propio; el
// título lo arma la casa a partir del registro, nunca lo que mande el formulario.

const BACK = "/app/yo/trayectoria";
const kindSchema = z.enum(["COMMITTEE", "RECOGNITION"]);
const idSchema = z.string().min(1).max(64);

async function actorOrLogin() {
  const actor = await getActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(BACK)}`);
  return actor;
}

export async function publishAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const kind = kindSchema.parse(formData.get("kind"));
  const sourceId = idSchema.parse(formData.get("sourceId"));
  try {
    await publishCredentialAs(await actorContext(actor), { kind, sourceId });
  } catch (error) {
    if (error instanceof DomainError)
      redirect(`${BACK}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}

export async function revokeAction(formData: FormData): Promise<void> {
  const actor = await actorOrLogin();
  const publicId = idSchema.parse(formData.get("publicId"));
  try {
    await revokeCredentialAs(await actorContext(actor), publicId);
  } catch (error) {
    if (error instanceof DomainError)
      redirect(`${BACK}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(BACK);
  redirect(BACK);
}
