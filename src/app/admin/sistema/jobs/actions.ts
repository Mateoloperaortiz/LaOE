"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/app/_lib/actor";
import { retryDeadLetterAs } from "@/modules/system";

const PATH = "/admin/sistema/jobs";

/** Devuelve a la cola un evento en dead letter. Vive junto a su única ruta (ADR-080, ADR-110). */
export async function retryOutboxAction(formData: FormData): Promise<void> {
  const actor = await requireAdminContext(PATH);
  const id = z.string().min(1).parse(formData.get("id"));
  await retryDeadLetterAs(actor, id);
  revalidatePath(PATH);
}
