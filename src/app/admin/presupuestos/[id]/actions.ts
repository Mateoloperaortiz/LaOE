"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  approveBudgetAs,
  approveBudgetSchema,
  budgetLinesInputSchema,
  closeBudgetAs,
  decideEventApprovalAs,
  openBudgetAs,
  sanctionBudgetAs,
  sanctionBudgetSchema,
  setBudgetLinesAs,
} from "@/modules/finance";
import { assertAdmin, ForbiddenError, getActor } from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { clientIp } from "@/shared/lib/request";

// Detalle de un presupuesto (ADR-059 regla 2, ADR-060 regla 12): ADMIN fija rubros, registra las
// aprobaciones, abre, cierra, anota la sanción y decide los avales como Presidencia.

const ID = /^[a-z0-9-]{10,40}$/;
const MAX_LINES = 40;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function base(id: string): string {
  return `/admin/presupuestos/${id}`;
}

async function requireAdmin(returnTo: string) {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertAdmin(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  return { personId: actor.personId, ip: await clientIp() };
}

async function run(id: string, work: () => Promise<void>): Promise<void> {
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
  const id = text(formData, "budgetId");
  if (!ID.test(id)) {
    redirect("/admin/presupuestos");
  }
  return id;
}

export async function setLinesAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdmin(base(id));
  const lines = [];
  for (let index = 0; index < MAX_LINES; index += 1) {
    const name = text(formData, `line-${index}-name`);
    if (!name) {
      continue;
    }
    lines.push({
      id: text(formData, `line-${index}-id`) || undefined,
      name,
      assigned: text(formData, `line-${index}-assigned`) || "0",
      sortOrder: text(formData, `line-${index}-sortOrder`) || String(index),
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
  const actor = await requireAdmin(base(id));
  const parsed = approveBudgetSchema.safeParse({
    approver: text(formData, "approver"),
    on: text(formData, "on"),
  });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () => approveBudgetAs(actor, id, parsed.data));
}

export async function openAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdmin(base(id));
  await run(id, () => openBudgetAs(actor, id));
}

export async function closeAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdmin(base(id));
  await run(id, () => closeBudgetAs(actor, id));
}

export async function sanctionAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdmin(base(id));
  const parsed = sanctionBudgetSchema.safeParse({
    percent: text(formData, "percent"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () => sanctionBudgetAs(actor, id, parsed.data));
}

const decisionSchema = z.object({
  approvalId: z.string().regex(ID),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500),
});

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const id = budgetId(formData);
  const actor = await requireAdmin(base(id));
  const parsed = decisionSchema.safeParse({
    approvalId: text(formData, "approvalId"),
    decision: text(formData, "decision"),
    note: text(formData, "note"),
  });
  if (!parsed.success) {
    redirect(`${base(id)}?error=${encodeURIComponent("T-260")}`);
  }
  await run(id, () =>
    decideEventApprovalAs(actor, parsed.data.approvalId, {
      decision: parsed.data.decision,
      note: parsed.data.note,
    }),
  );
}
