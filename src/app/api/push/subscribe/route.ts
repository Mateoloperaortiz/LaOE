import { after } from "next/server";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import {
  removeSubscriptionAs,
  SubscriptionTakenError,
  saveSubscriptionAs,
  subscriptionInputSchema,
} from "@/modules/comms";
import { recordOnboardingEvidence } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/lib/errors";
import { userAgent } from "@/shared/lib/request";

// Suscripción push del actor (ADR-038 regla 5, ADR-113 regla 6): registra el dispositivo o actualiza
// el propio, y lo borra al quitar. Un endpoint que ya es de otra persona responde 409: el navegador
// suelta esa suscripción y pide una nueva. Registrar marca el paso "Activá las notificaciones" del
// onboarding, compuesto aquí como la normativa hace con NORMATIVA_READ.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = subscriptionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  let result: { id: string; created: boolean };
  try {
    result = await saveSubscriptionAs(await actorContext(actor), parsed.data, await userAgent());
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error instanceof SubscriptionTakenError ? 409 : 400;
      return Response.json({ error: error.message }, { status });
    }
    throw error;
  }
  const personId = actor.personId;
  after(() => recordOnboardingEvidence(personId, "PUSH_ENABLED"));
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

const removeSchema = z.object({ endpoint: z.url().max(2000) });

export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const removed = await removeSubscriptionAs(await actorContext(actor), {
    endpoint: parsed.data.endpoint,
  });
  return Response.json({ removed }, { headers: { "cache-control": "no-store" } });
}
