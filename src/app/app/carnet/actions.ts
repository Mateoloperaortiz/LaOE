"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sessionActorContext } from "@/app/_lib/actor";
import { ForbiddenError, getActor, rotateCarnetTokenAs } from "@/modules/identity";

// Revocar renueva solo el QR de las billeteras; el carnet oe1 y las sesiones siguen vigentes.
export async function revokeCarnetAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fapp%2Fcarnet");
  }
  if (formData.get("confirm") !== "1") {
    redirect("/app/carnet");
  }
  try {
    await rotateCarnetTokenAs(await sessionActorContext(actor));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  revalidatePath("/app/carnet");
  revalidatePath(`/admin/personas/${actor.personId}`);
  redirect("/app/carnet?guardado=carnet#billeteras");
}
