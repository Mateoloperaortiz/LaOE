"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { leaveCreativeFeedbackAs } from "@/modules/comms";
import { requireActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

export async function leaveFeedbackAction(form: FormData) {
  const path = "/app/mercadeo";
  const actor = await requireActor(path);
  try {
    await leaveCreativeFeedbackAs(await actorContext(actor), {
      id: formText(form, "id"),
      pieceId: formText(form, "piece"),
      body: formText(form, "body"),
    });
  } catch (error) {
    if (error instanceof DomainError || error instanceof ZodError)
      redirect(
        path +
          "?error=" +
          encodeURIComponent(error instanceof DomainError ? error.message : t("T-260")),
      );
    throw error;
  }
  revalidatePath(path);
  redirect(`${path}?guardado=1`);
}
