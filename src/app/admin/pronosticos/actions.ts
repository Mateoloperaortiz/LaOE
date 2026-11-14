"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { withQuery } from "@/app/_lib/search";
import {
  cancelMarketAs,
  createMarketAs,
  openMarketAs,
  resolveMarketAs,
  setMatchCapAs,
} from "@/modules/predictions";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

// Los pronósticos del Athletic, del lado de quien los maneja (ADR-197 regla 7). El dominio comprueba
// quién lidera el Athletic y quién decide por Gestión Humana; la acción lee el formulario.

const PAGE = "/admin/pronosticos";
const ID = /^[a-z0-9-]{10,40}$/;

async function run(work: (actor: Awaited<ReturnType<typeof actorContext>>) => Promise<unknown>) {
  const roles = await requireAdminAreaRoles(PAGE);
  const actor = await actorContext(roles.actor);
  try {
    await work(actor);
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof ZodError)) throw error;
    redirect(withQuery(PAGE, { error: error instanceof DomainError ? error.message : t("T-260") }));
  }
  revalidatePath(PAGE);
  revalidatePath("/app/pronosticos");
  redirect(withQuery(PAGE, { guardado: "1" }));
}

function id(formData: FormData, name: string): string {
  const value = formText(formData, name);
  if (!ID.test(value)) redirect(PAGE);
  return value;
}

export async function setCapAction(formData: FormData): Promise<void> {
  await run((actor) => setMatchCapAs(actor, Number.parseInt(formText(formData, "cap"), 10)));
}

export async function createMarketAction(formData: FormData): Promise<void> {
  const occasionId = id(formData, "occasionId");
  await run((actor) =>
    createMarketAs(actor, {
      occasionId,
      title: formText(formData, "title"),
      options: String(formData.get("options") ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    }),
  );
}

export async function openMarketAction(formData: FormData): Promise<void> {
  const marketId = id(formData, "marketId");
  await run((actor) => openMarketAs(actor, marketId));
}

export async function cancelMarketAction(formData: FormData): Promise<void> {
  const marketId = id(formData, "marketId");
  await run((actor) => cancelMarketAs(actor, marketId));
}

export async function resolveMarketAction(formData: FormData): Promise<void> {
  const marketId = id(formData, "marketId");
  const optionId = id(formData, "optionId");
  await run((actor) => resolveMarketAs(actor, marketId, optionId));
}
