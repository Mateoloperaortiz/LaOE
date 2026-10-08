"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOperator } from "@/app/_authz/occasion";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { hasRecentStepUp, readCarnet } from "@/modules/identity";
import {
  CHECK_IN_STATUSES,
  cancelOccasionAs,
  canOpenOccasion,
  closeOccasionAs,
  decideCheckInAs,
  decideManyAs,
  hostCheckInAs,
  listCheckIns,
  openOccasionAs,
  rotateSecretAs,
  setRotatingCodeAs,
} from "@/modules/participation";
import { getPeopleByIds } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Acciones de la consola y del modo anfitrión (ADR-035): viven en src/app porque componen identity
// (actor, permisos, step-up, carnet) y participation. Aprobar, rechazar, anular y cancelar son de
// ADMIN; abrir (solo sin puntos), cerrar, registrar y el código rotativo también del líder.

const idSchema = z.string().regex(/^[a-z0-9-]+$/);
const backSchema = z.enum(["consola", "anfitrion"]).catch("consola");

function pageUrl(id: string, back: "consola" | "anfitrion", extra: Record<string, string> = {}) {
  const base = back === "anfitrion" ? `/admin/ocasiones/${id}/anfitrion` : `/admin/ocasiones/${id}`;
  const query = new URLSearchParams(extra).toString();
  return query ? `${base}?${query}` : base;
}

async function operator(id: string, back: "consola" | "anfitrion") {
  const found = await requireOperator(id, pageUrl(id, back));
  if (!found) {
    redirect("/admin/ocasiones");
  }
  return found;
}

/** Corre el comando y vuelve a la pantalla; un DomainError vuelve con su mensaje. */
async function run(
  id: string,
  back: "consola" | "anfitrion",
  command: () => Promise<Record<string, string> | undefined>,
  extra: Record<string, string> = {},
): Promise<never> {
  let done: Record<string, string> | undefined;
  try {
    done = await command();
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(pageUrl(id, back, { ...extra, error: error.message }));
    }
    throw error;
  }
  revalidatePath(pageUrl(id, back));
  redirect(pageUrl(id, back, { guardado: "1", ...done }));
}

export async function lifecycleAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const op = formText(formData, "op");
  const { actor, occasion } = await operator(id, "consola");
  const who = await actorContext(actor);
  await run(id, "consola", async () => {
    if (op === "open") {
      if (!canOpenOccasion(actor, occasion)) {
        throw new DomainError(t("T-653"));
      }
      await openOccasionAs(who, id);
    } else if (op === "close") {
      await closeOccasionAs(who, id);
    }
    return undefined;
  });
}

export async function cancelAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const { actor, occasion } = await operator(id, "consola");
  if (!actor.isAdmin) {
    redirect("/app");
  }
  const returnTo = pageUrl(id, "consola", { accion: "cancelar" });
  if (occasion.points > 0 && occasion.approvedCount > 0 && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  const reason = formText(formData, "reason");
  await run(
    id,
    "consola",
    async () => {
      await cancelOccasionAs(await actorContext(actor), id, reason);
      return undefined;
    },
    { accion: "cancelar" },
  );
}

const decisionSchema = z.enum(["APPROVE", "REJECT", "CANCEL"]);
// El estado que mostraba la fila: el comando rechaza la decisión si ya no es ese (ADR-116 regla 1).
const seenStatusSchema = z.enum(CHECK_IN_STATUSES);

export async function decideAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const checkInId = idSchema.parse(formData.get("checkInId"));
  const decision = decisionSchema.parse(formData.get("decision"));
  const seenStatus = seenStatusSchema.parse(formData.get("seen"));
  const { actor } = await operator(id, "consola");
  if (!actor.isAdmin) {
    redirect("/app");
  }
  const reason = formText(formData, "reason") || null;
  await run(
    id,
    "consola",
    async () => {
      await decideCheckInAs(await actorContext(actor), {
        checkInId,
        decision,
        reason,
        seenStatus,
      });
      return undefined;
    },
    decision === "CANCEL" ? { accion: "anular", checkIn: checkInId } : {},
  );
}

export async function approveAllAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const { actor } = await operator(id, "consola");
  if (!actor.isAdmin) {
    redirect("/app");
  }
  await run(id, "consola", async () => {
    const pending = await listCheckIns(id, ["PENDING"]);
    await decideManyAs(
      await actorContext(actor),
      pending.map((item) => item.id),
      "APPROVE",
    );
    return undefined;
  });
}

export async function registerAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const personId = idSchema.parse(formData.get("personId"));
  const back = backSchema.parse(formText(formData, "back"));
  const { actor } = await operator(id, back);
  const people = await getPeopleByIds([personId]);
  const personName = people.get(personId)?.fullName?.trim() ?? "";
  await run(id, back, async () => {
    await hostCheckInAs(await actorContext(actor), {
      occasionId: id,
      personId,
      personName,
      source: actor.isAdmin ? "ADMIN" : "HOST",
    });
    return { nombre: personName };
  });
}

export async function rotatingAction(formData: FormData): Promise<void> {
  const id = idSchema.parse(formData.get("occasionId"));
  const op = formText(formData, "op");
  const { actor } = await operator(id, "consola");
  const who = await actorContext(actor);
  await run(id, "consola", async () => {
    if (op === "enable") {
      await setRotatingCodeAs(who, id, true);
    } else if (op === "disable") {
      await setRotatingCodeAs(who, id, false);
    } else if (op === "rotate") {
      await rotateSecretAs(who, id);
    }
    return undefined;
  });
}

/** El lector del carnet (client component) llama a esta acción con el token y recibe el resultado. */
export async function scanAction(
  occasionId: string,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const id = idSchema.parse(occasionId);
  const { actor } = await operator(id, "anfitrion");
  const carnet = await readCarnet(token);
  if (!carnet.ok) {
    return {
      ok: false,
      message:
        carnet.reason === "REVOKED"
          ? t("T-1207")
          : carnet.reason === "EXPIRED"
            ? t("T-619")
            : t("T-618"),
    };
  }
  const people = await getPeopleByIds([carnet.personId]);
  const personName = people.get(carnet.personId)?.fullName?.trim() ?? "";
  try {
    await hostCheckInAs(await actorContext(actor), {
      occasionId: id,
      personId: carnet.personId,
      personName,
      source: actor.isAdmin ? "ADMIN" : "HOST",
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
  revalidatePath(pageUrl(id, "anfitrion"));
  return { ok: true, message: t("T-602", { nombre: personName }) };
}
