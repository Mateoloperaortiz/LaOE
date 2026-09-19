"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  decisionInputSchema,
} from "@/modules/permanence";
import { DomainError } from "@/shared/admin-kit";

// Cierre de permanencia (ADR-036 regla 9): confirmar por persona, confirmar en bloque y aplicar;
// las dos últimas con step-up. Solo ADMIN.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function baseFor(termId: string, filtro: string): string {
  return `/admin/permanencia/cierre?termId=${termId}${filtro ? `&filtro=${filtro}` : ""}`;
}

function fail(back: string, error: unknown, extra = ""): never {
  if (error instanceof DomainError) {
    redirect(`${back}${extra}&error=${encodeURIComponent(error.message)}`);
  }
  throw error;
}

/** Confirmar la propuesta tal cual o con cambios: el formulario trae la decisión por comité y la de la persona. */
export async function confirmAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const filtro = String(formData.get("filtro") ?? "");
  const back = baseFor(termId, filtro);
  const actor = await requireAdminActor(back);
  const personId = idSchema.parse(formData.get("personId"));
  const committees: Array<{ committeeId: string; decision: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("comite:") && typeof value === "string") {
      committees.push({ committeeId: key.slice("comite:".length), decision: value });
    }
  }
  const parsed = decisionInputSchema.safeParse({
    personId,
    person: formData.get("persona"),
    committees,
    reason: formData.get("reason") ?? "",
  });
  const changing = formData.get("cambiar") === "1";
  const extra = changing ? `&persona=${personId}` : "";
  if (!parsed.success) {
    redirect(`${back}${extra}&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "")}`);
  }
  try {
    await confirmDecisionsAs(await actorContext(actor), termId, parsed.data);
  } catch (error) {
    fail(back, error, extra);
  }
  revalidatePath("/admin/permanencia/cierre");
  redirect(`${back}&guardado=1`);
}

export async function confirmAllAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = baseFor(termId, "");
  const actor = await requireAdminActor(back);
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${back}&accion=bloque`)}`);
  }
  let count = 0;
  try {
    count = await confirmAllProposedAs(await actorContext(actor), termId);
  } catch (error) {
    fail(back, error);
  }
  revalidatePath("/admin/permanencia/cierre");
  redirect(`${back}&bloque=${count}`);
}

export async function applyAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = baseFor(termId, "");
  const actor = await requireAdminActor(back);
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${back}&accion=aplicar`)}`);
  }
  try {
    await closeTermPermanenceAs(await actorContext(actor), termId);
  } catch (error) {
    fail(back, error);
  }
  revalidatePath("/admin/permanencia/cierre");
  revalidatePath("/admin/cierre");
  redirect(`${back}&aplicado=1`);
}
