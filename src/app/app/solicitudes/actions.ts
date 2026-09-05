"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createRequestAs, REQUEST_KINDS, withdrawRequestAs } from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";

// Solicitudes desde Mi OE (ADR-037 regla 9): licencia, retiro voluntario y cambio de comité para el
// semestre siguiente; una pendiente se puede retirar.

const LOGIN = "/ingresar?next=%2Fapp%2Fsolicitudes";
const idSchema = z.string().regex(/^[a-z0-9-]+$/);

async function requireOwnActor() {
  const actor = await getActor();
  if (!actor) {
    redirect(LOGIN);
  }
  return { personId: actor.personId, ip: await clientIp() };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function back(extra: Record<string, string> = {}, section = "solicitudes"): never {
  const query = new URLSearchParams(extra).toString();
  redirect(`/app/solicitudes${query ? `?${query}` : ""}#${section}`);
}

export async function createRequestAction(formData: FormData): Promise<void> {
  const actor = await requireOwnActor();
  const kind = text(formData, "kind");
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) {
    back();
  }
  const section = kind.toLowerCase();
  const payload =
    kind === "LEAVE"
      ? { reason: text(formData, "reason"), until: text(formData, "until") || undefined }
      : kind === "RESIGNATION"
        ? {
            reason: text(formData, "reason"),
            memorialConsent: formData.get("memorialConsent") === "on",
            contactConsent: formData.get("contactConsent") === "on",
            personalEmail: text(formData, "personalEmail") || undefined,
          }
        : {
            reason: text(formData, "reason"),
            leaveCommitteeIds: formData
              .getAll("leaveCommitteeIds")
              .filter((item): item is string => typeof item === "string" && item !== ""),
            joinCommitteeIds: formData
              .getAll("joinCommitteeIds")
              .filter((item): item is string => typeof item === "string" && item !== ""),
          };
  if (kind === "RESIGNATION" && formData.get("confirm") !== "on") {
    back({ error: t("T-890") }, section);
  }
  try {
    await createRequestAs(actor, kind as "LEAVE" | "RESIGNATION" | "TRANSFER", payload);
  } catch (error) {
    if (error instanceof DomainError) {
      back({ error: error.message }, section);
    }
    throw error;
  }
  revalidatePath("/app/solicitudes");
  back({ enviada: "1" });
}

export async function withdrawRequestAction(formData: FormData): Promise<void> {
  const actor = await requireOwnActor();
  const requestId = idSchema.parse(formData.get("requestId"));
  try {
    await withdrawRequestAs(actor, requestId);
  } catch (error) {
    if (error instanceof DomainError) {
      back({ error: error.message });
    }
    throw error;
  }
  revalidatePath("/app/solicitudes");
  back({ retirada: "1" });
}
