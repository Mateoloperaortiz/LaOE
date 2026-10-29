"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { formText } from "@/app/_lib/form";
import {
  adjustStockAs,
  createItemAs,
  manageIncidentAs,
  referIncidentAs,
  setReservationGrantAs,
  updateItemAs,
  writeOffAs,
} from "@/modules/inventory";
import { setLogisticsDirectorAs } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

async function run(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      `/admin/inventario?error=${encodeURIComponent(error instanceof DomainError ? error.message : t("T-4357"))}`,
    );
  }
  revalidatePath("/admin/inventario");
  revalidatePath("/app/inventario");
  revalidatePath("/app/cml");
  redirect("/admin/inventario?guardado=1");
}

export async function createItemAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(async () =>
    createItemAs(actor, {
      name: formText(formData, "name"),
      mode: z.enum(["UNIT", "QUANTITY"]).parse(formText(formData, "mode")),
      total: Number(formText(formData, "total")),
      location: formText(formData, "location"),
      box: formText(formData, "box"),
    }),
  );
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(() =>
    updateItemAs(actor, {
      itemId: formText(formData, "itemId"),
      name: formText(formData, "name"),
      location: formText(formData, "location"),
      box: formText(formData, "box"),
      active: formText(formData, "active") === "on",
    }),
  );
}

export async function adjustStockAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(async () => {
    const unitIds = z.array(z.string().min(1).max(80)).max(10000).parse(formData.getAll("unitId"));
    const intent = formText(formData, "intent");
    return adjustStockAs(actor, {
      itemId: formText(formData, "itemId"),
      delta:
        intent === "remove"
          ? -unitIds.length
          : intent === "release"
            ? 0
            : Number(formText(formData, "delta")),
      releaseQuarantine:
        intent === "release" ? unitIds.length : Number(formText(formData, "releaseQuarantine")),
      reason: formText(formData, "reason"),
      unitIds,
    });
  });
}

export async function grantAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(async () =>
    setReservationGrantAs(actor, {
      sourceKind: z
        .enum(["COMMITTEE_ASSIGNMENT", "MACROEVENT_APPOINTMENT"])
        .parse(formText(formData, "sourceKind")),
      sourceId: formText(formData, "sourceId"),
      enabled: formText(formData, "enabled") === "true",
    }),
  );
}

export async function directorAction(formData: FormData): Promise<void> {
  const { actor, context, session } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(async () => {
    const [kind, id] = formText(formData, "scope").split(":");
    if (!context.termId || !id || (kind !== "COMMITTEE" && kind !== "MACROEVENT"))
      throw new DomainError(t("T-4357"));
    return setLogisticsDirectorAs(
      { ...actor, isAdmin: session.isAdmin },
      kind === "COMMITTEE"
        ? { kind, committeeId: id, termId: context.termId }
        : { kind, editionId: id },
      {
        personId: formText(formData, "personId"),
        assigned: formText(formData, "assigned") !== "false",
        coDirector: formText(formData, "coDirector") === "on",
      },
    );
  });
}

export async function manageIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(() =>
    manageIncidentAs(actor, {
      incidentId: formText(formData, "incidentId"),
      management: formText(formData, "management"),
      status: formText(formData, "intent") === "resolve" ? "RESOLVED" : "OPEN",
    }),
  );
}

export async function referIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(() => referIncidentAs(actor, { incidentId: formText(formData, "incidentId") }));
}

export async function writeOffAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(async () => {
    const unitIds = z.array(z.string().min(1).max(80)).max(10000).parse(formData.getAll("unitId"));
    return writeOffAs(actor, {
      reservationId: formText(formData, "reservationId"),
      requestId: formText(formData, "requestId"),
      lineId: formText(formData, "lineId"),
      quantity:
        formText(formData, "mode") === "UNIT"
          ? unitIds.length
          : Number(formText(formData, "quantity")),
      unitIds,
      reason: formText(formData, "reason"),
    });
  });
}
