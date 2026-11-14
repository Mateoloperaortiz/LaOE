"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import { getMemberActor } from "@/modules/identity";
import { placePredictionAs } from "@/modules/predictions";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Pronosticar desde Mi OE (ADR-197 regla 7): un pronóstico sencillo llega como «pronóstico:opción»; un
// parley, como una elección por pronóstico. El dominio comprueba asistencia, hora, tope y saldo.

const PAGE = "/app/pronosticos";

function pickOf(value: string) {
  const [marketId = "", optionId = ""] = value.split(":");
  return { marketId, optionId };
}

async function place(formData: FormData, picks: Array<{ marketId: string; optionId: string }>) {
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(PAGE)}`);
  const occasionId = formText(formData, "occasionId");
  try {
    await placePredictionAs(await actorContext(actor), {
      occasionId,
      stake: Number.parseInt(formText(formData, "stake"), 10),
      picks,
    });
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(withQuery(PAGE, { error: error instanceof DomainError ? error.message : t("T-260") }));
  }
  revalidatePath(PAGE);
  redirect(withQuery(PAGE, { listo: "1" }));
}

export async function placeSingleAction(formData: FormData): Promise<void> {
  await place(formData, [pickOf(formText(formData, "pick"))]);
}

export async function placeParlayAction(formData: FormData): Promise<void> {
  const picks = formData
    .getAll("picks")
    .map((value) => String(value))
    .filter(Boolean)
    .map(pickOf);
  await place(formData, picks);
}
