"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createRequestAs,
  REQUEST_KINDS,
  REQUEST_PAYLOAD_SCHEMAS,
  type RequestKind,
  withdrawRequestAs,
} from "@/modules/crm";
import { getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { clientIp } from "@/shared/lib/request";
import type { RequestActionState } from "./form-state";

const LOGIN = "/ingresar?next=%2Fapp%2Fsolicitudes";
const idSchema = z.string().regex(/^[a-z0-9-]+$/);

async function requireOwnActor() {
  const actor = await getActor();
  if (!actor) redirect(LOGIN);
  return { personId: actor.personId, ip: await clientIp() };
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const actor = await requireOwnActor();
  const kind = text(formData, "kind");
  if (!(REQUEST_KINDS as readonly string[]).includes(kind)) {
    return { error: t("T-1581") };
  }
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
  const parsed = REQUEST_PAYLOAD_SCHEMAS[kind as RequestKind].safeParse(payload);
  const fieldErrors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "");
      fieldErrors[field] =
        field === "reason"
          ? t("T-1585")
          : field === "until"
            ? t("T-1586")
            : field === "personalEmail"
              ? t("T-1587")
              : t("T-887");
    }
  }
  if (kind === "RESIGNATION" && formData.get("confirm") !== "on") {
    fieldErrors.confirm = t("T-890");
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { error: t("T-1584"), fieldErrors };
  }
  try {
    await createRequestAs(actor, kind as RequestKind, payload);
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        error: error.message,
        ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}),
      };
    }
    throw error;
  }
  revalidatePath("/app/solicitudes");
  return { success: true };
}

export async function withdrawRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const actor = await requireOwnActor();
  const requestId = idSchema.safeParse(formData.get("requestId"));
  if (!requestId.success) return { error: t("T-032") };
  try {
    await withdrawRequestAs(actor, requestId.data);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  revalidatePath("/app/solicitudes");
  return { success: true };
}
