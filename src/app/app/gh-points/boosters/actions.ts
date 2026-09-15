"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor } from "@/modules/identity";
import { type BoosterTarget, setBoosterTargetAs } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Apuntar o soltar un booster (ADR-067 regla 8): la acción traduce el objetivo del formulario
// ("challenge:<id>" / "occasion:<id>" / vacío para soltar) y vuelve a la página de origen.

const inputSchema = z.object({
  boosterId: z.string().trim().max(80).default(""),
  currentBoosterId: z.string().trim().max(80).default(""),
  target: z.string().trim().max(120).default(""),
  op: z.string().trim().max(20).default(""),
  back: z.string().trim().max(300).default(""),
});

/** Solo rutas propias de Mi OE como destino de vuelta. */
function safeBack(value: string, fallback: string): string {
  return /^\/app(\/|$)/.test(value) ? value : fallback;
}

function withQuery(base: string, extra: Record<string, string>): string {
  const url = new URL(base, "http://local");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export async function setBoosterTargetAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    boosterId: formData.get("boosterId") ?? "",
    currentBoosterId: formData.get("currentBoosterId") ?? "",
    target: formData.get("target") ?? "",
    op: formData.get("op") ?? "",
    back: formData.get("back") ?? "",
  });
  const fallback = "/app/gh-points/boosters";
  if (!parsed.success) {
    redirect(fallback);
  }
  const { op } = parsed.data;
  const back = safeBack(parsed.data.back, fallback);
  const actor = await requireActor(back);
  const raw = parsed.data.target;
  let boosterId = parsed.data.boosterId;
  let target: BoosterTarget | null;
  if (op === "quitar") {
    boosterId = parsed.data.currentBoosterId || boosterId;
    target = null;
  } else if (raw === "" && boosterId === "") {
    // "Sin booster" en el selector: suelta el que estaba apuntado, si había.
    boosterId = parsed.data.currentBoosterId;
    if (!boosterId) {
      redirect(back);
    }
    target = null;
  } else if (raw === "") {
    target = null;
  } else if (raw.startsWith("challenge:")) {
    target = { challengeId: raw.slice("challenge:".length) };
  } else if (raw.startsWith("occasion:")) {
    target = { occasionId: raw.slice("occasion:".length) };
  } else {
    redirect(back);
  }
  if (!boosterId) {
    redirect(back);
  }
  try {
    await setBoosterTargetAs(
      { personId: actor.personId, ip: await clientIp() },
      { boosterId, target },
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(withQuery(back, { error: error.message, booster: boosterId }));
    }
    throw error;
  }
  revalidatePath("/app/gh-points");
  revalidatePath("/app/gh-points/boosters");
  revalidatePath("/app/gh-points/retos");
  redirect(withQuery(back, { guardado: boosterId }));
}
