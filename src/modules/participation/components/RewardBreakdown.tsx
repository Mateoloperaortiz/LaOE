import { t } from "@/shared/copy";
import type { BoosterKind } from "../gamification-types";

// Desglose del premio de un reto completado (ADR-067 regla 4): base + extra cuando hubo booster
// o campaña, aviso de tope y la rama de "booster no consumido" (de G-T4, ya cableada).

export interface RewardBreakdownData {
  base: number;
  extra: number;
  capped: boolean;
  personalConsumed: boolean;
}

export function RewardBreakdown({
  reward,
  boosterKind,
}: {
  reward: RewardBreakdownData;
  boosterKind?: BoosterKind | null;
}) {
  if (reward.extra <= 0 && !reward.capped && !(boosterKind && !reward.personalConsumed)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      {reward.extra > 0 ? (
        <p className="font-semibold">{t("T-2435", { base: reward.base, extra: reward.extra })}</p>
      ) : null}
      {reward.capped ? <p className="text-tinta-suave">{t("T-2436")}</p> : null}
      {boosterKind && !reward.personalConsumed ? (
        <p className="text-tinta-suave">{t("T-2437")}</p>
      ) : null}
    </div>
  );
}
