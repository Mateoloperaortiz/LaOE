"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { safeBack, withQuery } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
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
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";

// Acciones del editor de retos (ADR-067 reglas 2, 3 y 17): solo ADMIN. Cancelar un reto con
// premios entregados exige step-up (T-2515).

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

/** Un `datetime-local` se escribe en hora de Colombia; el servidor corre en UTC. */
function bogotaInstant(formData: FormData, name: string): Date | string {
  const value = formText(formData, name);
  return LOCAL_INPUT.test(value) ? bogotaInputToUtc(value) : value;
}

function parseChallenge(formData: FormData) {
  let questions: unknown = [];
  const raw = formText(formData, "questionsJson");
  if (raw) {
    try {
      questions = JSON.parse(raw);
    } catch {
      questions = [];
    }
  }
  return challengeInputSchema.safeParse({
    kind: formText(formData, "kind"),
    title: formText(formData, "title"),
    description: formText(formData, "description"),
    audience: formText(formData, "audience") || "ALL",
    audienceCommitteeIds: formData.getAll("audienceCommitteeIds"),
    opensAt: bogotaInstant(formData, "opensAt"),
    closesAt: bogotaInstant(formData, "closesAt"),
    basePoints: formText(formData, "basePoints"),
    passPercent: formText(formData, "passPercent"),
    occasionId: formText(formData, "occasionId"),
    questions,
  });
}

function firstIssue(parsed: { success: false; error: z.ZodError }): string {
  return parsed.error.issues[0]?.message ?? "T-260";
}

export async function saveChallengeAction(formData: FormData): Promise<void> {
  const id = formText(formData, "id");
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    id ? `/admin/gamificacion/retos/${id}` : "/admin/gamificacion/retos",
  );
  const actor = await requireAdminActor(back);
  const parsed = parseChallenge(formData);
  if (!parsed.success) {
    redirect(withQuery(back, { error: firstIssue(parsed) }));
  }
  try {
    if (id) {
      await updateChallengeAs(await actorContext(actor), id, parsed.data);
    } else {
      const created = await createChallengeAs(await actorContext(actor), parsed.data);
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
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    `/admin/gamificacion/retos/${id}`,
  );
  const actor = await requireAdminActor(withQuery(back, { accion: "publicar" }));
  try {
    await publishChallengeAs(await actorContext(actor), id);
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
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    `/admin/gamificacion/retos/${id}`,
  );
  const actor = await requireAdminActor(withQuery(back, { accion: "cancelar" }));
  const reason = formText(formData, "reason");
  if (await hasGrantedRewards(id)) {
    if (!hasRecentStepUp(actor)) {
      redirect(
        `/ingresar/paso?next=${encodeURIComponent(withQuery(back, { accion: "cancelar" }))}`,
      );
    }
  }
  try {
    await cancelChallengeAs(await actorContext(actor), id, reason);
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
  const back = safeBack(
    formText(formData, "back") || undefined,
    "/admin",
    `/admin/gamificacion/retos/${id}`,
  );
  const actor = await requireAdminActor(back);
  let created: { id: string };
  try {
    created = await duplicateChallengeAs(await actorContext(actor), id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message }));
    }
    throw error;
  }
  revalidatePath("/admin/gamificacion/retos");
  redirect(`/admin/gamificacion/retos/${created.id}?guardado=1`);
}
