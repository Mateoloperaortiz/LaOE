import { t } from "@/shared/copy";
import type { BoosterKind } from "../gamification-types";

// Desglose del premio de un reto completado (ADR-067 regla 4): base + extra cuando hubo booster
// o campaña, aviso de tope y la rama de "booster no consumido" (de G-T4, ya cableada).

export interface RewardBreakdownData {
  base: number;
  extra: number;
  capped: boolean;
  personalConsumed: boolean;
  /** Hubo booster pedido y no se consumió (la campaña o el tope lo cubrieron): aviso T-2437. */
  boosterRequested?: boolean;
}

export function RewardBreakdown({
  reward,
  boosterKind,
}: {
  reward: RewardBreakdownData;
  boosterKind?: BoosterKind | null;
}) {
  const boosterReturned = reward.boosterRequested ?? (boosterKind && !reward.personalConsumed);
  if (reward.extra <= 0 && !reward.capped && !boosterReturned) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      {reward.extra > 0 ? (
        <p className="font-semibold">{t("T-2435", { base: reward.base, extra: reward.extra })}</p>
      ) : null}
      {reward.capped ? <p className="text-tinta-suave">{t("T-2436")}</p> : null}
      {boosterReturned ? <p className="text-tinta-suave">{t("T-2437")}</p> : null}
    </div>
  );
}
