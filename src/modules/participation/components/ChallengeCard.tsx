import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import type { ChallengeAudience, ChallengeKind, ChallengeState } from "../gamification-types";

// Tarjeta de un reto como la ve un miembro (ADR-067): la misma en la lista de Mi OE (G-T3) y en
// la vista previa del editor del admin.

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

export interface ChallengeCardData {
  title: string;
  kind: ChallengeKind;
  audience: ChallengeAudience;
  closesAt: Date;
  basePoints: number;
  state: ChallengeState;
}

export function ChallengeCard({ card }: { card: ChallengeCardData }) {
  const kinds = tList("T-2409");
  const audiences = tList("T-2411");
  const states = tList("T-2511");
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
      </header>
      <h3 className="font-semibold text-titulo">{card.title}</h3>
      <p className="text-sm text-tinta-suave">
        {t("T-2412", { fecha: formatDateTime(card.closesAt) })}
      </p>
      <p className="font-semibold text-oe-blue">{t("T-2413", { n: card.basePoints })}</p>
    </article>
  );
}
