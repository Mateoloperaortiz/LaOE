"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { adjustPointsAs, reverseEntryAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Ajustes y reversiones del ledger (ADR-007, ADR-035 regla 9): solo ADMIN, siempre con motivo; vuelven
// al ledger (o a la Persona 360 si se abrió desde ahí) con `guardado=1` o con el error del dominio.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const adjustSchema = z.object({
  personId: idSchema,
  termId: idSchema,
  points: z.coerce.number().int(),
  reason: z.string().trim().max(500),
  back: z.string().optional(),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withQuery(base: string, extra: Record<string, string>): string {
  const url = new URL(base, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

async function requireAdmin(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return actor;
}

/** Solo rutas propias del admin como destino de vuelta. */
function safeBack(value: string | undefined, fallback: string): string {
  return value && /^\/admin\/[a-z0-9\-/[\]?=&%]*$/i.test(value) ? value : fallback;
}

export async function adjustAction(formData: FormData): Promise<void> {
  const parsed = adjustSchema.safeParse({
    personId: formData.get("personId"),
    termId: formData.get("termId"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    back: text(formData, "back") || undefined,
  });
  const back = safeBack(parsed.success ? parsed.data.back : undefined, "/admin/ledger");
  const returnTo = withQuery(back, { accion: "ajustar" });
  const actor = await requireAdmin(returnTo);
  if (!parsed.success) {
    redirect(withQuery(back, { accion: "ajustar", error: "T-260" }));
  }
  const { personId, termId, points, reason } = parsed.data;
  try {
    await adjustPointsAs(
      { personId: actor.personId, ip: await clientIp() },
      { personId, termId, points, reason },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { accion: "ajustar", personId, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back);
  redirect(withQuery(back, { guardado: "1" }));
}

export async function reverseAction(formData: FormData): Promise<void> {
  const entryId = idSchema.parse(formData.get("entryId"));
  const back = safeBack(text(formData, "back") || undefined, "/admin/ledger");
  const actor = await requireAdmin(withQuery(back, { accion: "revertir", entrada: entryId }));
  try {
    await reverseEntryAs(
      { personId: actor.personId, ip: await clientIp() },
      entryId,
      text(formData, "reason"),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { accion: "revertir", entrada: entryId, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back);
  redirect(withQuery(back, { guardado: "1" }));
}
