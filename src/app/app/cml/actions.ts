"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { formText } from "@/app/_lib/form";
import { checkoutAs, recordIncidentAs, returnAs } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

async function movement(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: t("T-4357") };
    throw error;
  }
  revalidatePath("/app/cml");
  revalidatePath("/app/inventario");
  revalidatePath("/admin/inventario");
  return { ok: true };
}

export async function checkoutAction(input: Parameters<typeof checkoutAs>[1]) {
  const { actor } = await requireInventoryAccess("/app/cml", "OPERATE");
  return movement(() => checkoutAs(actor, input));
}

export async function returnAction(input: Parameters<typeof returnAs>[1]) {
  const { actor } = await requireInventoryAccess("/app/cml", "OPERATE");
  return movement(() => returnAs(actor, input));
}

export async function recordIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/app/cml", "OPERATE");
  const result = await movement(() =>
    recordIncidentAs(actor, {
      reservationId: formText(formData, "reservationId"),
      note: formText(formData, "note"),
    }),
  );
  redirect(
    result.ok
      ? "/app/cml?guardado=1"
      : `/app/cml?error=${encodeURIComponent(result.error ?? t("T-4357"))}`,
  );
}
