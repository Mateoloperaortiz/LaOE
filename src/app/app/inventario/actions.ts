"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { formText } from "@/app/_lib/form";
import { cancelReservationAs, requestLoanApprovalAs, reserveAs } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventoryRange } from "./range";

// Reservar y cancelar desde Mi OE (ADR-150 reglas 3 y 4, ADR-191 regla 5). La disponibilidad y el
// permiso se vuelven a comprobar en el dominio, bajo bloqueo; esta capa solo arma la entrada.

const sourceSchema = z.object({
  sourceKind: z.enum(["COMMITTEE_ASSIGNMENT", "MACROEVENT_APPOINTMENT"]),
  sourceId: z.string().min(1).max(80),
});

function refresh() {
  revalidatePath("/app", "layout");
  revalidatePath("/admin/inventario", "layout");
  revalidatePath("/admin/calendario");
}

export async function reserveAction(formData: FormData): Promise<void> {
  return submitMaterials(formData, false);
}

export async function requestLoanAction(formData: FormData): Promise<void> {
  return submitMaterials(formData, true);
}

async function submitMaterials(formData: FormData, request: boolean): Promise<void> {
  const { actor } = await requireInventoryAccess("/app/inventario");
  const startsAt = formText(formData, "startsAt");
  const endsAt = formText(formData, "endsAt");
  const selected = formText(formData, "source").split(":");
  const parsed = sourceSchema.safeParse({ sourceKind: selected[0], sourceId: selected[1] });
  const range = inventoryRange(startsAt, endsAt);
  const query = new URLSearchParams({ desde: startsAt, hasta: endsAt });
  const back = () => `/app/inventario?${query.toString()}`;
  const itemIds = formData.getAll("itemId");
  if (!parsed.success || !range || itemIds.length > 100) {
    query.set("error", t("T-4357"));
    redirect(back());
  }
  const lines = itemIds.flatMap((value) => {
    if (typeof value !== "string") return [];
    const quantity = Number(formText(formData, `quantity-${value}`));
    return quantity > 0 ? [{ itemId: value, quantity }] : [];
  });
  try {
    if (request) {
      const purpose = z
        .enum(["COMMITTEE_EVENT", "MACROEVENT", "OTHER", "EXCEPTION"])
        .parse(formText(formData, "purpose"));
      await requestLoanApprovalAs(actor, {
        ...parsed.data,
        id: formText(formData, "requestKey"),
        purpose,
        title: formText(formData, "title"),
        startsAt: range.start.toISOString(),
        returnAt: range.end.toISOString(),
        eventStartsOn: formText(formData, "eventStartsOn"),
        eventEndsOn: formText(formData, "eventEndsOn"),
        eventApprovalId: formText(formData, "eventApprovalId"),
        minutes: formText(formData, "minutes"),
        supportingRecord: formText(formData, "supportingRecord"),
        lateReason: formText(formData, "lateReason"),
        lines,
      });
    } else {
      await reserveAs(actor, {
        ...parsed.data,
        approvalId: formText(formData, "approvalId"),
        requestKey: formText(formData, "requestKey"),
        startsAt: range.start.toISOString(),
        endsAt: range.end.toISOString(),
        collectorId: formText(formData, "collectorId") || undefined,
        lines,
      });
    }
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    query.set("error", error instanceof DomainError ? error.message : t("T-4357"));
    redirect(back());
  }
  refresh();
  query.set("guardado", request ? "solicitud" : "1");
  revalidatePath("/admin/mesa");
  redirect(back());
}

export async function cancelReservationAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/app/inventario");
  try {
    await cancelReservationAs(actor, {
      reservationId: formText(formData, "reservationId"),
      reason: formText(formData, "reason"),
    });
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      `/app/inventario?error=${encodeURIComponent(error instanceof DomainError ? error.message : t("T-4357"))}`,
    );
  }
  refresh();
  redirect("/app/inventario?guardado=1");
}
