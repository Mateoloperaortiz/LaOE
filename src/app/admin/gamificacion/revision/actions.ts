"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import { annulParticipationAs, reviewParticipationAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Revisión de evidencias y anulación de premios (ADR-067 reglas 5 y 17): solo ADMIN; anular un
// premio entregado exige step-up (T-2586).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withQuery(base: string, extra: Record<string, string>): string {
  const url = new URL(base, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function requireAdmin(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return actor;
}

/** Solo rutas propias del admin como destino de vuelta. */
function safeBack(value: string | undefined): string {
  return value && /^\/admin\/[a-z0-9\-/[\]?=&%]*$/i.test(value)
    ? value
    : "/admin/gamificacion/revision";
}

export async function reviewAction(formData: FormData): Promise<void> {
  const participationId = idSchema.parse(formData.get("participationId"));
  const decision = z.enum(["APPROVE", "REJECT"]).parse(formData.get("decision"));
  const back = safeBack(text(formData, "back") || undefined);
  const actor = await requireAdmin(back);
  try {
    await reviewParticipationAs(
      { personId: actor.personId, ip: await clientIp() },
      { participationId, decision, reason: text(formData, "reason") || null },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function annulAction(formData: FormData): Promise<void> {
  const participationId = idSchema.parse(formData.get("participationId"));
  const back = safeBack(text(formData, "back") || undefined);
  const actor = await requireAdmin(back);
  if (!hasRecentStepUp(actor)) {
    redirect(
      `/ingresar/paso?next=${encodeURIComponent(withQuery(back, { accion: "anular", participationId }))}`,
    );
  }
  try {
    await annulParticipationAs(
      { personId: actor.personId, ip: await clientIp() },
      participationId,
      text(formData, "reason"),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion");
  redirect(withQuery(back, { guardado: "1" }));
}
