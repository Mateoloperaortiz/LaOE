import { z } from "zod";

interface PublicationFact {
  action: string;
  at: Date;
  after: unknown;
}

const opened = z.object({ status: z.literal("OPEN") });
const series = z.object({ series: z.literal(true) });

/** La creación corriente o importada no acredita publicación; una serie sí nace abierta. */
export function verifiedNoticePublication(
  stored: Date | null,
  facts: readonly PublicationFact[],
): { at: Date; evidenceAt: Date; action: string } | null {
  const evidence = facts
    .filter(
      (fact) =>
        (fact.action === "occasion.opened" && opened.safeParse(fact.after).success) ||
        (fact.action === "occasion.created" && series.safeParse(fact.after).success),
    )
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (!evidence) return null;
  return {
    at: new Date(Math.max(evidence.at.getTime(), stored?.getTime() ?? 0)),
    evidenceAt: evidence.at,
    action: evidence.action,
  };
}
