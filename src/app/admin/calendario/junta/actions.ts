"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  BOARD_CALENDAR_AREAS,
  cancelBoardEventAs,
  createBoardEventAs,
  updateBoardEventAs,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Agendar, cambiar o quitar una fecha del calendario de la junta (ADR-197 regla 6). El dominio
// comprueba el cargo; la acción lee el formulario y vuelve con lo que pasó.

const ID = /^[a-z0-9-]{10,40}$/;
const PAGE = "/admin/calendario/junta";

async function run(work: () => Promise<unknown>, back: Record<string, string>, ok: string) {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery(PAGE, {
        ...back,
        error: error instanceof DomainError ? error.message : t("T-260"),
      }),
    );
  }
  revalidatePath("/admin/calendario", "layout");
  redirect(withQuery(PAGE, { guardado: ok }));
}

export async function saveBoardEventAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles(PAGE);
  const actor = await actorContext(roles.actor);
  const id = formText(formData, "eventId");
  const input = {
    title: formText(formData, "title"),
    area: BOARD_CALENDAR_AREAS.find((item) => item === formText(formData, "area")) ?? "BOARD",
    startsAt: formText(formData, "startsAt"),
    endsAt: formText(formData, "endsAt"),
    location: formText(formData, "location"),
    description: formText(formData, "description"),
  };
  if (id && !ID.test(id)) redirect(PAGE);
  await run(
    () => (id ? updateBoardEventAs(actor, id, input) : createBoardEventAs(actor, input)),
    id ? { editar: id } : {},
    "1",
  );
}

export async function cancelBoardEventAction(formData: FormData): Promise<void> {
  const roles = await requireAdminAreaRoles(PAGE);
  const id = formText(formData, "eventId");
  if (!ID.test(id)) redirect(PAGE);
  const actor = await actorContext(roles.actor);
  await run(() => cancelBoardEventAs(actor, id), { editar: id }, "quitado");
}
