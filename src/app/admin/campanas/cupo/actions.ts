"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { liftCampaignQuotaCutAs, setTransactionalReserveAs } from "@/modules/comms";
import { requireAdminActor } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";

// El cupo de correo (ADR-116 reglas 19 y 20): cambiar el margen y levantar el corte, solo ADMIN. El
// guard de la action no es el único: cada comando exige además el alcance de ADMIN declarado.

const BASE = "/admin/campanas/cupo";

/** Un entero sin signo y de pocas cifras: lo demás ni llega al comando. */
const RESERVE = /^\d{1,6}$/;

export async function saveReserveAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor(BASE);
  const raw = formText(formData, "reserve");
  if (!RESERVE.test(raw)) {
    redirect(withQuery(BASE, { error: "margen" }));
  }
  try {
    await setTransactionalReserveAs(await actorContext(actor), { by: "ADMIN" }, Number(raw));
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(BASE, { error: "margen" }));
    }
    throw error;
  }
  revalidatePath(BASE);
  redirect(withQuery(BASE, { guardado: "margen" }));
}

export async function liftCutAction(): Promise<void> {
  const actor = await requireAdminActor(BASE);
  const lifted = await liftCampaignQuotaCutAs(
    await actorContext(actor),
    { by: "ADMIN" },
    new Date(),
  );
  revalidatePath(BASE);
  redirect(withQuery(BASE, { guardado: lifted ? "corte" : "sin-corte" }));
}
