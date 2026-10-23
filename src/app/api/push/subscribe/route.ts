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
import { logger } from "@/shared/log";

// Suscripción push del actor (ADR-038 regla 5, ADR-113 regla 6): registra el dispositivo o actualiza
// el propio, y lo borra al quitar. Un endpoint que ya es de otra persona responde 409: el navegador
// suelta esa suscripción y pide una nueva. Registrar marca el paso "Activá las notificaciones" del
// onboarding, compuesto aquí como la normativa hace con NORMATIVA_READ. Esa evidencia corre después de
// responder y se audita con la misma IP que el dispositivo: la ruta la lee una vez, antes de `after()`
// (ADR-123 regla 3).

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = subscriptionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Solo campo y código de cada problema: el endpoint y las claves nunca van al registro
    // (ADR-118 regla 25). Sin esto, un dispositivo que el navegador cree activo y la casa rechaza
    // no deja rastro en ninguna parte.
    logger.warn(
      {
        personId: actor.personId,
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`),
      },
      "suscripción push rechazada",
    );
    return Response.json({ error: "Suscripción inválida" }, { status: 400 });
  }
  const who = await actorContext(actor);
  let result: { id: string; created: boolean };
  try {
    result = await saveSubscriptionAs(who, parsed.data, await userAgent());
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error instanceof SubscriptionTakenError ? 409 : 400;
      logger.warn(
        { personId: actor.personId, status, errorName: error.name },
        "suscripción push rechazada",
      );
      return Response.json({ error: error.message }, { status });
    }
    throw error;
  }
  after(() => recordOnboardingEvidence(who.personId, "PUSH_ENABLED", who.ip));
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
