import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { requireConfig } from "@/modules/system";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { onboardingProgress } from "../schema";

// Onboarding de nuevos (02-crm.md): los pasos salen de `onboarding.steps`; cada uno se marca a mano
// o con evidencia automática, por persona y término.

export interface OnboardingStep {
  key: string;
  label: string;
  auto: string | null;
  doneAt: Date | null;
}

export async function getOnboarding(personId: string, termId: string): Promise<OnboardingStep[]> {
  const [steps, rows] = await Promise.all([
    requireConfig("onboarding.steps"),
    getDb()
      .select({ stepKey: onboardingProgress.stepKey, doneAt: onboardingProgress.doneAt })
      .from(onboardingProgress)
      .where(and(eq(onboardingProgress.personId, personId), eq(onboardingProgress.termId, termId))),
  ]);
  return steps.map((step) => ({
    key: step.key,
    label: step.label,
    auto: step.auto,
    doneAt: rows.find((row) => row.stepKey === step.key)?.doneAt ?? null,
  }));
}

/** Marca un paso como hecho; devuelve false si ya lo estaba. */
export async function markOnboardingStep(
  ctx: CommandContext,
  personId: string,
  termId: string,
  stepKey: string,
  source: "MANUAL" | "AUTO" = "MANUAL",
  now = new Date(),
): Promise<boolean> {
  const steps = await requireConfig("onboarding.steps");
  if (!steps.some((step) => step.key === stepKey)) {
    throw new DomainError(t("T-032"));
  }
  const inserted = await ctx.tx
    .insert(onboardingProgress)
    .values({ personId, termId, stepKey, doneAt: now, source })
    .onConflictDoNothing()
    .returning({ id: onboardingProgress.id });
  if (inserted.length === 0) {
    const updated = await ctx.tx
      .update(onboardingProgress)
      .set({ doneAt: now, source })
      .where(
        and(
          eq(onboardingProgress.personId, personId),
          eq(onboardingProgress.termId, termId),
          eq(onboardingProgress.stepKey, stepKey),
          isNull(onboardingProgress.doneAt),
        ),
      )
      .returning({ id: onboardingProgress.id });
    if (updated.length === 0) {
      return false;
    }
  }
  await ctx.audit({
    action: "onboarding.step-done",
    entityType: "onboarding_progress",
    entityId: `${personId}:${termId}:${stepKey}`,
    after: { stepKey, source },
  });
  return true;
}
