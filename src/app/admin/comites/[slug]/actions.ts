"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertLeader, ForbiddenError, getActor } from "@/modules/identity";
import {
  createOccasionAs,
  createOccasionSeriesAs,
  occasionInputSchema,
} from "@/modules/participation";
import { listInternalRoster } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { clientIp } from "@/shared/lib/request";

// Acciones de la vista de líder (ADR-035 regla 15): ADMIN o líder del comité; una ocasión nueva nace
// en borrador con el comité fijo; la serie semanal crea reuniones abiertas sin puntos.

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function leaderOf(slug: string, returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const roster = await listInternalRoster(slug);
  if (!roster) {
    redirect("/admin");
  }
  const committee = roster.committee;
  try {
    assertLeader(actor, committee.id);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return { actor, committee };
}

function back(slug: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/comites/${slug}${query ? `?${query}` : ""}`;
}

export async function proposeOccasionAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, committee } = await leaderOf(slug, back(slug, { accion: "nueva" }));
  const parsed = occasionInputSchema.safeParse({
    title: text(formData, "title"),
    kind: "ACTIVITY",
    category: text(formData, "category") || "OTHER",
    description: text(formData, "description"),
    location: text(formData, "location"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt") || undefined,
    points: text(formData, "points") || "0",
    approval: text(formData, "approval") || "AUTO",
    committeeId: committee.id,
  });
  if (!parsed.success) {
    redirect(back(slug, { accion: "nueva", error: parsed.error.issues[0]?.message ?? t("T-260") }));
  }
  try {
    await createOccasionAs({ personId: actor.personId, ip: await clientIp() }, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { accion: "nueva", error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { guardado: "1" }));
}

const seriesSchema = z.object({
  title: z.string().trim().min(2).max(120),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(600),
  location: z.string().trim().max(200).default(""),
});

export async function createSeriesAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, committee } = await leaderOf(slug, back(slug, { accion: "serie" }));
  const parsed = seriesSchema.safeParse({
    title: text(formData, "title"),
    firstDate: text(formData, "firstDate"),
    time: text(formData, "time"),
    durationMinutes: text(formData, "durationMinutes") || "90",
    location: text(formData, "location"),
  });
  const local = parsed.success ? `${parsed.data.firstDate}T${parsed.data.time}` : "";
  if (!parsed.success || !LOCAL_INPUT.test(local)) {
    redirect(back(slug, { accion: "serie", error: t("T-260") }));
  }
  try {
    const result = await createOccasionSeriesAs(
      { personId: actor.personId, ip: await clientIp() },
      {
        committeeId: committee.id,
        title: parsed.data.title,
        firstStartsAt: bogotaInputToUtc(local),
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
      },
    );
    revalidatePath(back(slug));
    redirect(
      back(slug, {
        serie: String(result.created),
        hasta: result.lastStartsAt ? result.lastStartsAt.toISOString() : "",
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { accion: "serie", error: error.message }));
    }
    throw error;
  }
}
