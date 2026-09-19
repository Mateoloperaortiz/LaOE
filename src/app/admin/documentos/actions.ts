"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import {
  parseArticlesJson,
  publishDocumentAs,
  replaceArticlesAs,
  unpublishDocumentAs,
} from "@/modules/content";
import { requireAdminActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Acciones de /admin/documentos: publicar, despublicar y cargar los artículos desde el JSON del extractor.

const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/);

function back(id?: string, extra: Record<string, string> = {}): never {
  const qs = new URLSearchParams(extra).toString();
  redirect(`/admin/documentos${id ? `/${id}` : ""}${qs ? `?${qs}` : ""}`);
}

export async function publicationAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor("/admin/documentos");
  const id = idSchema.safeParse(formData.get("id"));
  const intent = formData.get("intent");
  const checksum = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .safeParse(formData.get("contentSha256") || null);
  if (!id.success || !checksum.success || (intent !== "publish" && intent !== "unpublish")) {
    back();
  }
  try {
    if (intent === "publish") {
      await publishDocumentAs(await actorContext(actor), id.data, checksum.data);
    } else {
      await unpublishDocumentAs(await actorContext(actor), id.data);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      back(id.data, { error: error.message });
    }
    throw error;
  }
  revalidatePath("/admin/documentos");
  revalidatePath(`/admin/documentos/${id.data}`);
  revalidatePath("/app/normativa");
  revalidatePath(`/app/normativa/${id.data}`);
  back(id.data, { estado: intent === "publish" ? "publicado" : "borrador" });
}

export async function loadArticlesAction(formData: FormData): Promise<void> {
  const actor = await requireAdminActor("/admin/documentos");
  const id = idSchema.safeParse(formData.get("id"));
  const file = formData.get("json");
  if (!id.success || !(file instanceof File)) {
    back();
  }
  const parsed = parseArticlesJson(await file.text());
  if (!parsed.ok) {
    back(id.data, { error: t("T-499", { detalle: parsed.detail }) });
  }
  try {
    const loaded = await replaceArticlesAs(await actorContext(actor), id.data, parsed.data);
    revalidatePath("/admin/documentos");
    revalidatePath(`/admin/documentos/${id.data}`);
    revalidatePath("/app/normativa");
    revalidatePath(`/app/normativa/${id.data}`);
    back(id.data, { cargado: String(loaded) });
  } catch (error) {
    if (error instanceof DomainError) {
      back(id.data, { error: error.message });
    }
    throw error;
  }
}
