"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { assertAdmin, ForbiddenError, getActor, requireAdminActor } from "@/modules/identity";
import {
  grantPermanenceBonusAs,
  permanenceBonusInputSchema,
  requestRecomputeAs,
} from "@/modules/permanence";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { parseBonusTotal } from "./bonus-input";

// Recalcular ahora (ADR-036 regla 5): encola el recompute del término con su clave; el poller lo corre.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);

export async function grantBonusAction(
  termId: string,
  personId: string,
  filter: string,
  _previous: { error: string; refresh?: boolean } | null,
  formData: FormData,
): Promise<{ error: string; refresh?: boolean }> {
  const path = "/admin/permanencia/cumplimiento";
  const back = withQuery(path, { termId, filtro: filter });
  const actor = await requireAdminActor(back);
  const parsed = permanenceBonusInputSchema.safeParse({
    termId,
    personId,
    ruleIds: formData.getAll("ruleIds"),
    total: parseBonusTotal(formText(formData, "total")),
    reason: formText(formData, "reason"),
    requestId: formText(formData, "requestId"),
  });
  if (!parsed.success) return { error: t("T-4867") };
  try {
    await grantPermanenceBonusAs(await actorContext(actor), parsed.data);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, refresh: true };
    throw error;
  }
  revalidatePath(path);
  revalidatePath(`/admin/personas/${personId}`);
  revalidatePath("/app/permanencia");
  revalidatePath("/app");
  redirect(withQuery(back, { bonoGuardado: "1" }));
}

export async function recomputeAction(formData: FormData): Promise<void> {
  const termId = idSchema.parse(formData.get("termId"));
  const back = `/admin/permanencia/cumplimiento?termId=${termId}`;
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(back)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  await requestRecomputeAs(await actorContext(actor), termId);
  revalidatePath("/admin/permanencia/cumplimiento");
  redirect(`${back}&recalculando=1`);
}
