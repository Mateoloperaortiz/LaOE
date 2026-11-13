"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formRaw } from "@/app/_lib/form";
import { getMemberActor } from "@/modules/identity";
import { saveHandoverAs, verifyHandoverAs } from "@/modules/people";
import { DomainError } from "@/shared/lib/errors";

// Guardar y verificar el empalme de un cargo propio (ADR-172): el dominio comprueba que la persona
// tenga el cargo en el semestre actual.

const BACK = "/app/yo/empalme";
const ref = z.object({ committeeId: z.string().min(1), roleCode: z.string().min(1) });

async function run(
  formData: FormData,
  command: (actor: Awaited<ReturnType<typeof actorContext>>) => Promise<void>,
) {
  const actor = await getMemberActor();
  if (!actor) redirect(`/ingresar?next=${encodeURIComponent(BACK)}`);
  try {
    await command(await actorContext(actor));
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${BACK}?error=${encodeURIComponent(error.message)}#${formData.get("committeeId")}`);
    }
    throw error;
  }
  revalidatePath(BACK);
  redirect(`${BACK}?guardado=1`);
}

export async function saveHandoverAction(formData: FormData): Promise<void> {
  const input = ref.parse({
    committeeId: formData.get("committeeId"),
    roleCode: formData.get("roleCode"),
  });
  const body = formRaw(formData, "body");
  await run(formData, (actor) => saveHandoverAs(actor, { ...input, body }));
}

export async function verifyHandoverAction(formData: FormData): Promise<void> {
  const input = ref.parse({
    committeeId: formData.get("committeeId"),
    roleCode: formData.get("roleCode"),
  });
  await run(formData, (actor) => verifyHandoverAs(actor, input));
}
