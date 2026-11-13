"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { checkoutAs, recordIncidentAs, returnAs } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Las acciones del CML (ADR-150 reglas 5 a 8): entregar, recibir y registrar una novedad. Entregar y
// recibir responden con el resultado a la consola, que conserva su borrador si algo falla.

const PATH = "/admin/inventario/entregas";

function refresh() {
  revalidatePath("/admin/inventario", "layout");
  revalidatePath("/admin/campo");
  revalidatePath("/app", "layout");
}

async function movement(work: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    if (error instanceof ZodError) return { ok: false, error: t("T-4357") };
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function checkoutAction(input: Parameters<typeof checkoutAs>[1]) {
  const { actor } = await requireInventoryAccess(PATH, "OPERATE");
  return movement(() => checkoutAs(actor, input));
}

export async function returnAction(input: Parameters<typeof returnAs>[1]) {
  const { actor } = await requireInventoryAccess(PATH, "OPERATE");
  return movement(() => returnAs(actor, input));
}

export async function recordIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess(PATH, "OPERATE");
  const reservationId = formText(formData, "reservationId");
  const result = await movement(() =>
    recordIncidentAs(actor, { reservationId, note: formText(formData, "note") }),
  );
  redirect(
    withQuery(PATH, {
      reserva: reservationId,
      ...(result.ok ? { guardado: "1" } : { error: result.error ?? t("T-4357") }),
    }),
  );
}
