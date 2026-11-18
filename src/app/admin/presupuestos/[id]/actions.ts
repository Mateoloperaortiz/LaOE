"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import {
  approveBudgetAs,
  approveBudgetSchema,
  budgetLinesInputSchema,
  closeBudgetAs,
  openBudgetAs,
  requestExtraordinaryAs,
  sanctionBudgetAs,
  sanctionBudgetSchema,
  setBudgetLinesAs,
} from "@/modules/finance";
import { DomainError } from "@/shared/lib/errors";

// Detalle de un presupuesto (ADR-059 regla 2, ADR-060 regla 12): ADMIN fija rubros, registra las
// aprobaciones, abre, cierra, anota la sanción y decide los avales como Presidencia.

const ID = /^[a-z0-9-]{10,40}$/;
const MAX_LINES = 40;

function base(id: string): string {
  return `/admin/presupuestos/${id}`;
}

async function run(id: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`${base(id)}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(base(id));
  revalidatePath("/admin/presupuestos");
  redirect(`${base(id)}?guardado=1`);
}

function budgetId(formData: FormData): string {
  const id = formText(formData, "budgetId");
  if (!ID.test(id)) {
    redirect("/admin/presupuestos");
  }
  return id;
}

export async function setLinesAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  const lines = [];
  for (let index = 0; index < MAX_LINES; index += 1) {
    const name = formText(formData, `line-${index}-name`);
    if (!name) {
      continue;
    }
    lines.push({
      id: formText(formData, `line-${index}-id`) || undefined,
      name,
      assigned: formText(formData, `line-${index}-assigned`) || "0",
      sortOrder: formText(formData, `line-${index}-sortOrder`) || String(index),
    });
  }
  const parsed = budgetLinesInputSchema.safeParse({ lines });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () => setBudgetLinesAs(actor, id, parsed.data));
}

export async function approveAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  const parsed = approveBudgetSchema.safeParse({
    approver: formText(formData, "approver"),
    on: formText(formData, "on"),
  });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () => approveBudgetAs(actor, id, parsed.data));
}

export async function requestExtraordinaryAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  await run(id, () =>
    requestExtraordinaryAs(actor, id, { committeeId: formText(formData, "committeeId") }),
  );
}

export async function openAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  await run(id, () => openBudgetAs(actor, id));
}

export async function closeAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  await run(id, () => closeBudgetAs(actor, id));
}

export async function sanctionAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdminContext(base(id));
  const parsed = sanctionBudgetSchema.safeParse({
    percent: formText(formData, "percent"),
    reason: formText(formData, "reason"),
  });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () => sanctionBudgetAs(actor, id, parsed.data));
}
