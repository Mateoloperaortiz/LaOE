"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  adjustStockAs,
  cancelReservationAs,
  createItemAs,
  decideLoanApprovalAs,
  manageIncidentAs,
  referIncidentAs,
  setReservationGrantAs,
  updateItemAs,
  writeOffAs,
} from "@/modules/inventory";
import { setLogisticsDirectorAs } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { INVENTORY_PATHS, type InventoryTab } from "./_ui/tabs";

// Las acciones de la VP administrativa (ADR-150 reglas 2, 3, 6 y 8). Cada una vuelve a su pestaña con
// lo que acaba de pasar en la dirección, y con el registro abierto cuando lo hay.

type Volver = { tab: InventoryTab; keep?: Record<string, string> };

async function run<T>(
  volver: Volver,
  work: () => Promise<T>,
  after?: (result: T) => Record<string, string>,
) {
  const path = INVENTORY_PATHS[volver.tab];
  let result: T;
  try {
    result = await work();
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(
      withQuery(path, {
        ...volver.keep,
        error: error instanceof DomainError ? error.message : t("T-4357"),
      }),
    );
  }
  revalidatePath("/admin/inventario", "layout");
  revalidatePath("/app/inventario");
  redirect(withQuery(path, { ...volver.keep, ...after?.(result), guardado: "1" }));
}

export async function createItemAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  await run(
    { tab: "materiales" },
    () =>
      createItemAs(actor, {
        name: formText(formData, "name"),
        mode: z.enum(["UNIT", "QUANTITY"]).parse(formText(formData, "mode")),
        total: Number(formText(formData, "total")),
        location: formText(formData, "location"),
        box: formText(formData, "box"),
      }),
    (created) => ({ material: created.id }),
  );
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  const itemId = formText(formData, "itemId");
  await run({ tab: "materiales", keep: { material: itemId } }, () =>
    updateItemAs(actor, {
      itemId,
      name: formText(formData, "name"),
      location: formText(formData, "location"),
      box: formText(formData, "box"),
      active: formText(formData, "active") === "on",
    }),
  );
}

export async function adjustStockAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  const itemId = formText(formData, "itemId");
  await run({ tab: "materiales", keep: { material: itemId } }, () => {
    const unitIds = z.array(z.string().min(1).max(80)).max(10000).parse(formData.getAll("unitId"));
    const intent = formText(formData, "intent");
    return adjustStockAs(actor, {
      itemId,
      delta:
        intent === "remove"
          ? -unitIds.length
          : intent === "release"
            ? 0
            : Number(formText(formData, "delta") || "0"),
      releaseQuarantine:
        intent === "release"
          ? unitIds.length
          : Number(formText(formData, "releaseQuarantine") || "0"),
      reason: formText(formData, "reason"),
      unitIds,
    });
  });
}

export async function grantAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario/logistica", "MANAGE");
  await run({ tab: "logistica" }, () =>
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
  const { actor, context, session } = await requireInventoryAccess(
    "/admin/inventario/logistica",
    "MANAGE",
  );
  await run({ tab: "logistica" }, () => {
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

export async function cancelReservationAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario/prestamos", "MANAGE");
  const reservationId = formText(formData, "reservationId");
  await run({ tab: "prestamos", keep: { reserva: reservationId } }, () =>
    cancelReservationAs(actor, { reservationId, reason: formText(formData, "reason") }),
  );
}

export async function writeOffAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario/prestamos", "MANAGE");
  const reservationId = formText(formData, "reservationId");
  await run({ tab: "prestamos", keep: { reserva: reservationId } }, () => {
    const unitIds = z.array(z.string().min(1).max(80)).max(10000).parse(formData.getAll("unitId"));
    return writeOffAs(actor, {
      reservationId,
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

export async function manageIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario/novedades", "MANAGE");
  const incidentId = formText(formData, "incidentId");
  await run({ tab: "novedades", keep: { novedad: incidentId } }, () =>
    manageIncidentAs(actor, {
      incidentId,
      management: formText(formData, "management"),
      status: formText(formData, "intent") === "resolve" ? "RESOLVED" : "OPEN",
    }),
  );
}

export async function referIncidentAction(formData: FormData): Promise<void> {
  const { actor } = await requireInventoryAccess("/admin/inventario/novedades", "MANAGE");
  const incidentId = formText(formData, "incidentId");
  await run({ tab: "novedades", keep: { novedad: incidentId } }, () =>
    referIncidentAs(actor, { incidentId }),
  );
}

export async function decideLoanAction(data: FormData) {
  const path = "/admin/inventario/prestamos";
  const { actor } = await requireInventoryAccess(path, "MANAGE");
  try {
    await decideLoanApprovalAs(actor, formText(data, "id"), {
      decision: z.enum(["APPROVED", "REJECTED"]).parse(formText(data, "decision")),
      note: formText(data, "note"),
    });
  } catch (error) {
    if (error instanceof DomainError || error instanceof ZodError)
      redirect(
        withQuery(path, { error: error instanceof DomainError ? error.message : t("T-260") }),
      );
    throw error;
  }
  revalidatePath(path);
  revalidatePath("/admin/mesa");
  revalidatePath("/app/inventario");
  redirect(withQuery(path, { guardado: "1" }));
}
