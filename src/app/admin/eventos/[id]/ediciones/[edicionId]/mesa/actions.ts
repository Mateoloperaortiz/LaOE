"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminContext } from "@/app/_lib/actor";
import { formRaw } from "@/app/_lib/form";
import { getEdition } from "@/modules/events";
import {
  addMacroeventDirectorAs,
  MACROEVENT_ROLE_CODES,
  removeAppointmentAs,
} from "@/modules/people";
import { findTermContaining, getCurrentTerm } from "@/modules/terms";
import { dateKeyIn } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";

// Mesa directiva de una edición (ADR-060 regla 9): ADMIN registra el resultado de la elección de la
// Asamblea; el cargo queda en el término que contiene la fecha de la edición (o el vigente).

const ID = /^[a-z0-9-]{10,40}$/;
const idSchema = z.string().regex(ID);

const addSchema = z.object({
  eventId: idSchema,
  editionId: idSchema,
  personId: idSchema,
  roleCode: z.enum(MACROEVENT_ROLE_CODES),
  coDirector: z.boolean(),
});

const removeSchema = z.object({
  eventId: idSchema,
  editionId: idSchema,
  appointmentId: idSchema,
});

function base(eventId: string, editionId: string): string {
  return `/admin/eventos/${eventId}/ediciones/${editionId}/mesa`;
}

export async function addDirectorAction(formData: FormData): Promise<void> {
  const eventId = formRaw(formData, "eventId");
  const editionId = formRaw(formData, "editionId");
  const back = base(eventId, editionId);
  const actor = await requireAdminContext(back);
  const parsed = addSchema.safeParse({
    eventId,
    editionId,
    personId: formRaw(formData, "personId"),
    roleCode: formRaw(formData, "roleCode"),
    coDirector: formData.get("coDirector") === "on",
  });
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("T-260")}`);
  }
  const edition = await getEdition(parsed.data.editionId);
  if (!edition || edition.eventId !== parsed.data.eventId) {
    redirect(`${back}?error=${encodeURIComponent("T-260")}`);
  }
  const term =
    (await findTermContaining(dateKeyIn("America/Bogota", edition.startsAt))) ??
    (await getCurrentTerm());
  if (!term) {
    redirect(`${back}?error=${encodeURIComponent("T-260")}`);
  }
  const overrideReason = formRaw(formData, "overrideReason").trim();
  try {
    await addMacroeventDirectorAs(
      actor,
      {
        editionId: parsed.data.editionId,
        termId: term.id,
        personId: parsed.data.personId,
        roleCode: parsed.data.roleCode,
        coDirector: parsed.data.coDirector,
      },
      overrideReason ? { reason: overrideReason } : undefined,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(back);
  redirect(`${back}?guardado=1`);
}

export async function removeDirectorAction(formData: FormData): Promise<void> {
  const eventId = formRaw(formData, "eventId");
  const editionId = formRaw(formData, "editionId");
  const back = base(eventId, editionId);
  const actor = await requireAdminContext(back);
  const parsed = removeSchema.safeParse({
    eventId,
    editionId,
    appointmentId: formRaw(formData, "appointmentId"),
  });
  if (!parsed.success) {
    redirect(`${back}?error=${encodeURIComponent("T-260")}`);
  }
  try {
    await removeAppointmentAs(actor, parsed.data.appointmentId);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(back);
  redirect(`${back}?guardado=1`);
}
