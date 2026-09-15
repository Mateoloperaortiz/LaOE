"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { setConfigAs } from "@/modules/system";
import { clientIp } from "@/shared/lib/request";

// Guardado de límites y activación (ADR-067 regla 15): solo ADMIN; cada clave es un comando
// auditado por separado.

const capsSchema = z.object({
  daily: z.coerce.number().int().min(0).max(1000),
  weekly: z.coerce.number().int().min(0).max(5000),
});
const defaultsSchema = z.object({
  trivia: z.coerce.number().int().min(0).max(20),
  presential: z.coerce.number().int().min(0).max(20),
  evidence: z.coerce.number().int().min(0).max(20),
  passPercent: z.coerce.number().int().min(1).max(100),
});

const BACK = "/admin/gamificacion/limites";

export async function saveLimitsAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(BACK)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  const caps = capsSchema.safeParse({
    daily: formData.get("daily"),
    weekly: formData.get("weekly"),
  });
  const defaults = defaultsSchema.safeParse({
    trivia: formData.get("trivia"),
    presential: formData.get("presential"),
    evidence: formData.get("evidence"),
    passPercent: formData.get("passPercent"),
  });
  if (!caps.success || !defaults.success) {
    redirect(`${BACK}?error=T-260`);
  }
  const me = { personId: actor.personId, ip: await clientIp() };
  await setConfigAs(me, "gamification.caps", caps.data);
  await setConfigAs(me, "gamification.defaults", defaults.data);
  await setConfigAs(me, "gamification.enabled", formData.get("enabled") === "1");
  revalidatePath(BACK);
  redirect(`${BACK}?guardado=1`);
}
