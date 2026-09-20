"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { safeBack } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { markSeenAs, setFeaturedAs } from "@/modules/participation";
import { DomainError } from "@/shared/lib/errors";

const COLLECTION = "/app/gh-points/coleccion";

// Destacar o soltar una insignia del directorio y marcar vistas las del diálogo (ADR-067 regla 9).

const featuredSchema = z.object({
  achievementId: z.string().trim().min(1).max(80),
  featured: z.enum(["1", "0"]),
  back: z.string().trim().max(300).default("/app/gh-points/coleccion"),
});

export async function setFeaturedAction(formData: FormData): Promise<void> {
  const parsed = featuredSchema.safeParse({
    achievementId: formData.get("achievementId") ?? "",
    featured: formData.get("featured") ?? "",
    back: formData.get("back") ?? "",
  });
  const back = safeBack(parsed.success ? parsed.data.back : "", COLLECTION, COLLECTION);
  const actor = await requireActor("/app/gh-points/coleccion");
  if (!parsed.success) {
    redirect(back);
  }
  try {
    await setFeaturedAs(await actorContext(actor), {
      achievementId: parsed.data.achievementId,
      featured: parsed.data.featured === "1",
    });
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=destacadas`);
    }
    throw error;
  }
  revalidatePath("/app/gh-points/coleccion");
  revalidatePath("/app/personas");
  redirect(back);
}

const seenSchema = z.array(z.string().trim().min(1).max(80)).max(20);

export async function markSeenAction(achievementIds: string[]): Promise<void> {
  const parsed = seenSchema.safeParse(achievementIds);
  if (!parsed.success) {
    return;
  }
  const actor = await requireActor("/app/gh-points/coleccion");
  await markSeenAs(await actorContext(actor), parsed.data);
  revalidatePath("/app/gh-points/coleccion");
  revalidatePath("/app/gh-points");
}
