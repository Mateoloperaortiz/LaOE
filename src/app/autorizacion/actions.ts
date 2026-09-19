"use server";

import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { getActor } from "@/modules/identity";
import { recordConsentAs } from "@/modules/people";
import { PrivacyPolicyPendingError } from "@/modules/system";

// ADR-048: la autorización de membresía la da el titular, con fuente SELF; la versión y la IP
// las estampa el dominio. La importación del roster ya no crea consentimientos.
export async function autorizarAction(): Promise<void> {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fapp");
  }
  let registrado = true;
  try {
    await recordConsentAs(await actorContext(actor), actor.personId, "MEMBERSHIP", "SELF");
  } catch (error) {
    if (!(error instanceof PrivacyPolicyPendingError)) {
      throw error;
    }
    // La política volvió a `pendiente` entre que se pintó la pantalla y el envío.
    registrado = false;
  }
  redirect(registrado ? "/app" : "/autorizacion");
}
