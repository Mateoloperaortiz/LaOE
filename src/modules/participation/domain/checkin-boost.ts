import { eq } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import type { CampaignPercent } from "../gamification-types";
import { type checkIn, reward } from "../schema";
import { activeCampaignFor, findTargetedBooster } from "./challenges";
import { boosterPercent, isVoluntaryOccasion } from "./gamification-pure";
import type { GamificationSettings } from "./member-context";
import type { OccasionRow } from "./occasions";
import {
  grantReward,
  releaseReward,
  rereserveReward,
  reserveReward,
  reverseReward,
} from "./rewards";

// Asistencia impulsada (ADR-067 reglas 4 y 8): el booster apuntado a la ocasión —o la campaña
// vigente— suma un extra sobre los puntos de la actividad. La base la acredita `creditCheckIn`
// fuera del cupo; aquí solo se reserva/confirma el extra (source CHECKIN, baseGranted 0).

export type CheckInBoostOutcome = "APPROVED" | "PENDING" | "REJECTED" | "CANCELLED";

// El tipo sale del schema y no de check-ins.ts: ese módulo importa este gancho.
type CheckInRow = typeof checkIn.$inferSelect;

export async function applyCheckInBoost(
  ctx: CommandContext,
  input: {
    checkIn: CheckInRow;
    occasion: OccasionRow;
    outcome: CheckInBoostOutcome;
    reason?: string | null | undefined;
    now?: Date | undefined;
  },
  context: { settings: GamificationSettings },
): Promise<void> {
  const { checkIn: current, occasion: row, outcome } = input;
  if (!context.settings.enabled || !isVoluntaryOccasion(row) || row.points <= 0) {
    return;
  }
  const now = input.now ?? new Date();
  const [existing] = await ctx.tx
    .select()
    .from(reward)
    .where(eq(reward.checkInId, current.id))
    .limit(1);

  if (outcome === "REJECTED") {
    if (existing?.status === "RESERVED") {
      await releaseReward(ctx, existing.id, input.reason ?? t("T-2432", { motivo: "" }));
    }
    return;
  }
  if (outcome === "CANCELLED") {
    if (existing?.status === "GRANTED") {
      await reverseReward(ctx, existing.id, input.reason ?? "", now);
    } else if (existing?.status === "RESERVED") {
      await releaseReward(ctx, existing.id, input.reason ?? "");
    }
    return;
  }
  if (existing && existing.status !== "RESERVED" && existing.status !== "RELEASED") {
    return;
  }
  // Una reserva previa ya guardó su booster y su campaña: confirmarla no vuelve a buscarlos
  // (el booster quedó RESERVED y `findTargetedBooster` solo mira los AVAILABLE).
  if (existing?.status === "RESERVED") {
    if (outcome === "APPROVED") {
      await grantReward(
        ctx,
        existing.id,
        {
          base: "",
          extra: t("T-2470", {
            porcentaje: Math.min(existing.personalPercent + existing.campaignPercent, 100),
            origen: row.title,
          }),
        },
        now,
      );
    }
    return;
  }

  const [booster, campaign] = await Promise.all([
    findTargetedBooster(ctx.tx, current.personId, { occasionId: row.id }, now),
    activeCampaignFor(ctx.tx, { occasionId: row.id }, now),
  ]);
  if (!booster && !campaign) {
    return;
  }
  const personalPercent: 0 | 50 | 100 = booster ? boosterPercent(booster.kind) : 0;
  const campaignPercent: 0 | CampaignPercent = campaign?.percent ?? 0;
  const porcentaje = Math.min(personalPercent + campaignPercent, 100);
  const reserveInput = {
    personId: current.personId,
    termId: row.termId,
    source: "CHECKIN" as const,
    checkInId: current.id,
    base: row.points,
    boosterItemId: booster?.id ?? null,
    expectedTarget: { occasionId: row.id },
    personalPercent,
    campaignId: campaign?.id ?? null,
    campaignPercent,
    now,
  };
  if (outcome === "PENDING") {
    await reserveReward(ctx, reserveInput, context.settings.caps);
    return;
  }
  // APPROVED: confirma en el alta automática o revive la fila liberada de una reaprobación.
  const reasons = {
    base: "",
    extra: t("T-2470", { porcentaje, origen: row.title }),
  };
  if (existing?.status === "RELEASED") {
    // Reaprobación tras un rechazo: el unique por checkInId no admite otra fila, así que la
    // liberada se recalcula contra el cupo de hoy y vuelve a RESERVED antes de confirmar.
    await rereserveReward(ctx, existing.id, reserveInput, context.settings.caps, now);
    await grantReward(ctx, existing.id, reasons, now);
    return;
  }
  const reserved = await reserveReward(ctx, reserveInput, context.settings.caps);
  await grantReward(ctx, reserved.reward.id, reasons, now);
}
