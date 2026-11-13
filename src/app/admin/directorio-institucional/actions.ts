"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { addUnitContactAs, createUnitAs, saveDirectoryEntryAs } from "@/modules/crm";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// El directorio institucional (ADR-197 regla 3): el dominio comprueba que quien edita sea la
// Presidencia; la acción lee el formulario y vuelve con lo que pasó.

const PAGE = "/admin/directorio-institucional";
const ID = /^[a-z0-9-]{10,40}$/;

async function run(work: (actor: Awaited<ReturnType<typeof actorContext>>) => Promise<unknown>) {
  const roles = await requireAdminAreaRoles(PAGE);
  const actor = await actorContext(roles.actor);
  try {
    await work(actor);
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(withQuery(PAGE, { error: error instanceof DomainError ? error.message : t("T-260") }));
  }
  revalidatePath(PAGE);
  revalidatePath("/app/directorio-institucional");
  redirect(withQuery(PAGE, { guardado: "1" }));
}

export async function createUnitAction(formData: FormData): Promise<void> {
  await run((actor) => createUnitAs(actor, { name: formText(formData, "name") }));
}

export async function addUnitContactAction(formData: FormData): Promise<void> {
  const organizationId = formText(formData, "organizationId");
  if (!ID.test(organizationId)) redirect(PAGE);
  await run((actor) =>
    addUnitContactAs(actor, organizationId, {
      firstName: formText(formData, "firstName"),
      lastName: formText(formData, "lastName"),
      email: formText(formData, "email"),
      role: formText(formData, "role"),
    }),
  );
}

export async function saveDirectoryEntryAction(formData: FormData): Promise<void> {
  const contactId = formText(formData, "contactId");
  if (!ID.test(contactId)) redirect(PAGE);
  await run((actor) =>
    saveDirectoryEntryAs(actor, contactId, {
      functions: formText(formData, "functions"),
      handles: formText(formData, "handles"),
      published: formData.get("published") === "on",
      photoAuthorized: formData.get("photoAuthorized") === "on",
      photoAssetId: formText(formData, "photoAssetId") || null,
    }),
  );
}
