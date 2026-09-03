"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runCommand } from "@/db/tx";
import { assertAdmin, getActor } from "@/modules/identity";
import { retryDeadLetter } from "./domain/outbox";

export async function retryOutboxAction(formData: FormData): Promise<void> {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fadmin%2Fsistema%2Fjobs");
  }
  assertAdmin(actor);
  const id = z.string().min(1).parse(formData.get("id"));
  await runCommand({ personId: actor.personId }, (ctx) => retryDeadLetter(ctx, id));
  revalidatePath("/admin/sistema/jobs");
}
