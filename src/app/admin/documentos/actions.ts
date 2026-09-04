"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  parseArticlesJson,
  publishDocumentAs,
  replaceArticlesAs,
  unpublishDocumentAs,
} from "@/modules/content";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

// Acciones de /admin/documentos: publicar, despublicar y cargar los artículos desde el JSON del extractor.

const idSchema = z.string().regex(/^[a-z0-9]{10,40}$/);

async function requireAdmin() {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fadmin%2Fdocumentos");
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

function back(extra: Record<string, string> = {}): never {
  const qs = new URLSearchParams(extra).toString();
  redirect(`/admin/documentos${qs ? `?${qs}` : ""}`);
}

export async function publicationAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  const intent = formData.get("intent");
  if (!id.success) {
    back();
  }
  try {
    if (intent === "publish") {
      await publishDocumentAs(actor, id.data);
    } else {
      await unpublishDocumentAs(actor, id.data);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      back({ error: error.message });
    }
    throw error;
  }
  revalidatePath("/admin/documentos");
  back();
}

export async function loadArticlesAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  const file = formData.get("json");
  if (!id.success || !(file instanceof File)) {
    back();
  }
  const parsed = parseArticlesJson(await file.text());
  if (!parsed.ok) {
    back({ error: t("T-499", { detalle: parsed.detail }) });
  }
  try {
    const loaded = await replaceArticlesAs(actor, id.data, parsed.data);
    revalidatePath("/admin/documentos");
    back({ cargado: String(loaded) });
  } catch (error) {
    if (error instanceof DomainError) {
      back({ error: error.message });
    }
    throw error;
  }
}
