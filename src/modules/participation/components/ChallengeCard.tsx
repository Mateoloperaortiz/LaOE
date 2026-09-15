import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import type {
  BoosterKind,
  CampaignPercent,
  ChallengeAudience,
  ChallengeKind,
  ChallengeState,
  MemberChallengeStatus,
} from "../gamification-types";

// Tarjeta de un reto como la ve un miembro (ADR-067): la misma en la lista de Mi OE (G-T3) y en
// la vista previa del editor del admin. Los datos del miembro (estado, premio, campaña) son
// opcionales: sin ellos queda la tarjeta genérica de la vista previa.

const KIND_INDEX: Record<ChallengeKind, number> = {
  PRESENTIAL: 0,
  TRIVIA: 1,
  EVIDENCE: 2,
};
const AUDIENCE_INDEX: Record<ChallengeAudience, number> = {
  ALL: 0,
  NEW: 1,
  VETERAN: 2,
  COMMITTEES: 3,
};
const STATE_INDEX: Record<ChallengeState, number> = {
  DRAFT: 0,
  SCHEDULED: 1,
  OPEN: 2,
  CLOSED: 3,
  CANCELLED: 4,
};
const STATUS_INDEX: Record<MemberChallengeStatus, number> = {
  AVAILABLE: 0,
  SENT: 1,
  PENDING: 2,
  COMPLETED: 3,
  REJECTED: 4,
  EXPIRED: 5,
};
const STATUS_STYLE: Record<MemberChallengeStatus, "amarillo" | "naranja" | "sky" | "paper"> = {
  AVAILABLE: "paper",
  SENT: "sky",
  PENDING: "sky",
  COMPLETED: "amarillo",
  REJECTED: "naranja",
  EXPIRED: "naranja",
};
const BOOSTER_INDEX: Record<BoosterKind, number> = { PLUS_50: 0, PLUS_100: 1 };

export interface ChallengeCardData {
  title: string;
  kind: ChallengeKind;
  audience: ChallengeAudience;
  closesAt: Date;
  basePoints: number;
  state: ChallengeState;
  /** Estado de la entrega del miembro; ausente en la vista previa del admin. */
  status?: MemberChallengeStatus;
  campaignPercent?: 0 | CampaignPercent;
  campaignEndsAt?: Date | null;
  /** Booster del miembro apuntado al reto (G-T4: el selector llega después). */
  boosterKind?: BoosterKind | null;
  /** Premio entregado (COMPLETED). */
  rewardPoints?: number | null;
  /** Premio reservado (PENDING). */
  pendingPoints?: number | null;
}

export function ChallengeCard({ card }: { card: ChallengeCardData }) {
  const kinds = tList("T-2409");
  const audiences = tList("T-2411");
  const states = tList("T-2511");
  const memberStates = tList("T-2410");
  const points =
    card.status === "COMPLETED" && card.rewardPoints != null ? card.rewardPoints : card.basePoints;
  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="eyebrow rounded-full border border-borde px-2 py-0.5 text-xs">
          {kinds[KIND_INDEX[card.kind]] ?? card.kind}
        </span>
        <span className="eyebrow text-xs text-tinta-suave">
          {audiences[AUDIENCE_INDEX[card.audience]] ?? card.audience}
        </span>
        <span className="eyebrow text-xs text-tinta-suave">
          {states[STATE_INDEX[card.state]] ?? card.state}
        </span>
        {card.status ? (
          <Insignia fondo={STATUS_STYLE[card.status]}>
            {memberStates[STATUS_INDEX[card.status]] ?? card.status}
          </Insignia>
        ) : null}
      </header>
      <h3 className="font-semibold text-titulo">{card.title}</h3>
      <p className="text-sm text-tinta-suave">
        {t("T-2412", { fecha: formatDateTime(card.closesAt) })}
      </p>
      <p className="font-semibold text-titulo">{t("T-2413", { n: points })}</p>
      {card.pendingPoints != null && card.status === "PENDING" ? (
        <p className="text-sm font-semibold">{t("T-2572", { n: card.pendingPoints })}</p>
      ) : null}
      {card.status && card.basePoints > 0 ? (
        <p className="text-sm text-tinta-suave">{t("T-2414")}</p>
      ) : null}
      {card.status && (card.campaignPercent ?? 0) > 0 ? (
        <p className="text-sm font-semibold text-titulo">
          {t("T-2416", {
            n: card.campaignPercent ?? 0,
            fecha: formatDateTime(card.campaignEndsAt ?? card.closesAt),
          })}
        </p>
      ) : null}
      {card.boosterKind ? (
        <p className="text-sm font-semibold">
          {t("T-2415", {
            booster: tList("T-2451")[BOOSTER_INDEX[card.boosterKind]] ?? card.boosterKind,
          })}
        </p>
      ) : null}
    </article>
  );
}
