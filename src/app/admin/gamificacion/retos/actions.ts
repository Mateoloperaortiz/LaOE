"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor, hasRecentStepUp } from "@/modules/identity";
import {
  cancelChallengeAs,
  challengeInputSchema,
  createChallengeAs,
  duplicateChallengeAs,
  hasGrantedRewards,
  publishChallengeAs,
  updateChallengeAs,
} from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Acciones del editor de retos (ADR-067 reglas 2, 3 y 17): solo ADMIN. Cancelar un reto con
// premios entregados exige step-up (T-2515).

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
function safeBack(value: string | undefined, fallback: string): string {
  return value && /^\/admin\/[a-z0-9\-/[\]?=&%]*$/i.test(value) ? value : fallback;
}

function parseChallenge(formData: FormData) {
  let questions: unknown = [];
  const raw = text(formData, "questionsJson");
  if (raw) {
    try {
      questions = JSON.parse(raw);
    } catch {
      questions = [];
    }
  }
  return challengeInputSchema.safeParse({
    kind: text(formData, "kind"),
    title: text(formData, "title"),
    description: text(formData, "description"),
    audience: text(formData, "audience") || "ALL",
    audienceCommitteeIds: formData.getAll("audienceCommitteeIds"),
    opensAt: text(formData, "opensAt"),
    closesAt: text(formData, "closesAt"),
    basePoints: text(formData, "basePoints"),
    passPercent: text(formData, "passPercent"),
    occasionId: text(formData, "occasionId"),
    questions,
  });
}

function firstIssue(parsed: { success: false; error: z.ZodError }): string {
  return parsed.error.issues[0]?.message ?? "T-260";
}

export async function saveChallengeAction(formData: FormData): Promise<void> {
  const id = text(formData, "id");
  const back = safeBack(
    text(formData, "back") || undefined,
    id ? `/admin/gamificacion/retos/${id}` : "/admin/gamificacion/retos",
  );
  const actor = await requireAdmin(back);
  const parsed = parseChallenge(formData);
  if (!parsed.success) {
    redirect(withQuery(back, { error: firstIssue(parsed) }));
  }
  try {
    if (id) {
      await updateChallengeAs({ personId: actor.personId, ip: await clientIp() }, id, parsed.data);
    } else {
      const created = await createChallengeAs(
        { personId: actor.personId, ip: await clientIp() },
        parsed.data,
      );
      revalidatePath("/admin/gamificacion/retos");
      redirect(`/admin/gamificacion/retos/${created.id}?guardado=1`);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion/retos");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function publishChallengeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = safeBack(text(formData, "back") || undefined, `/admin/gamificacion/retos/${id}`);
  const actor = await requireAdmin(withQuery(back, { accion: "publicar" }));
  try {
    await publishChallengeAs({ personId: actor.personId, ip: await clientIp() }, id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion/retos");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function cancelChallengeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = safeBack(text(formData, "back") || undefined, `/admin/gamificacion/retos/${id}`);
  const actor = await requireAdmin(withQuery(back, { accion: "cancelar" }));
  const reason = text(formData, "reason");
  if (await hasGrantedRewards(id)) {
    if (!hasRecentStepUp(actor)) {
      redirect(
        `/ingresar/paso?next=${encodeURIComponent(withQuery(back, { accion: "cancelar" }))}`,
      );
    }
  }
  try {
    await cancelChallengeAs({ personId: actor.personId, ip: await clientIp() }, id, reason);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { accion: "cancelar", error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion/retos");
  redirect(withQuery(back, { guardado: "1" }));
}

export async function duplicateChallengeAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("id"));
  const back = safeBack(text(formData, "back") || undefined, `/admin/gamificacion/retos/${id}`);
  const actor = await requireAdmin(back);
  let created: { id: string };
  try {
    created = await duplicateChallengeAs({ personId: actor.personId, ip: await clientIp() }, id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion/retos");
  redirect(`/admin/gamificacion/retos/${created.id}?guardado=1`);
}
