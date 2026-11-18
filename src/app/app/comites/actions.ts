"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { requestCandidacyAs } from "@/modules/people";
import { DomainError } from "@/shared/lib/errors";

export async function requestCandidacyAction(data: FormData) {
  const page = "/app/comites";
  const actor = await requireActor(page);
  try {
    await requestCandidacyAs(await actorContext(actor), {
      termId: formText(data, "termId"),
      committeeId: formText(data, "committeeId"),
      roleCode: formText(data, "roleCode"),
    });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    redirect(`${withQuery(page, { error: error.message })}#postulaciones`);
  }
  revalidatePath(page);
  revalidatePath("/admin", "layout");
  redirect(`${withQuery(page, { guardado: "1" })}#postulaciones`);
}
