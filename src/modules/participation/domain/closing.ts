import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { listActiveMemberRefs, listCommitteesByIds } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { checkIn, occasion, pointEntry, termStanding } from "../schema";
import { rankCommittees, rankPeople } from "./rankings";

// Cierre de puntos del término (ADR-004, ADR-035 regla 13): snapshot de los tableros con ids y nombres
// congelados; el término se estampa en `terms` dentro de la misma transacción.

const standingPerson = z.object({
  rank: z.number().int(),
  personId: z.string(),
  name: z.string(),
  total: z.number().int(),
});
const standingCommittee = z.object({
  rank: z.number().int(),
  committeeId: z.string(),
  name: z.string(),
  score: z.number(),
  rawScore: z.number(),
  occasions: z.number().int(),
});
const standingStats = z
  .object({
    activeMembers: z.number().int(),
    newMembers: z.number().int(),
    occasions: z.number().int(),
    checkIns: z.number().int(),
    pointsAwarded: z.number().int(),
  })
  .passthrough();

export type StandingPerson = z.infer<typeof standingPerson>;
export type StandingCommittee = z.infer<typeof standingCommittee>;
export type StandingStats = z.infer<typeof standingStats>;

export interface TermStandingView {
  termId: string;
  topNew: StandingPerson[];
  topVeteran: StandingPerson[];
  topCommittees: StandingCommittee[];
  stats: StandingStats;
  createdAt: Date;
}

export const TOP_SIZE = 10;

/** Los tableros y las cifras que se congelan; se calculan fuera de la transacción. */
export async function buildStanding(
  termId: string,
): Promise<Omit<TermStandingView, "termId" | "createdAt">> {
  const [nuevos, veteranos, comites, members] = await Promise.all([
    rankPeople(termId, "NEW"),
    rankPeople(termId, "VETERAN"),
    rankCommittees(termId),
    listActiveMemberRefs(),
  ]);
  const committees = await listCommitteesByIds(comites.map((item) => item.row.committeeId));
  const committeeName = new Map(committees.map((item) => [item.id, item.name]));
  const db = getDb();
  const [occasions] = await db
    .select({ n: count() })
    .from(occasion)
    .where(and(eq(occasion.termId, termId), ne(occasion.status, "CANCELLED")));
  const termOccasions = db
    .select({ id: occasion.id })
    .from(occasion)
    .where(eq(occasion.termId, termId));
  const [approved] = await db
    .select({ n: count() })
    .from(checkIn)
    .where(and(inArray(checkIn.occasionId, termOccasions), eq(checkIn.status, "APPROVED")));
  const [points] = await db
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(eq(pointEntry.termId, termId));
  const top = (rows: typeof nuevos) =>
    rows
      .filter((item) => item.total > 0)
      .slice(0, TOP_SIZE)
      .map((item) => ({
        rank: item.rank,
        personId: item.row.personId,
        name: item.row.anonymized ? t("T-223") : item.row.name,
        total: item.total,
      }));
  return {
    topNew: top(nuevos),
    topVeteran: top(veteranos),
    topCommittees: comites.map((item) => ({
      rank: item.rank,
      committeeId: item.row.committeeId,
      name: committeeName.get(item.row.committeeId) ?? "",
      score: item.row.score,
      rawScore: item.row.rawScore,
      occasions: item.row.occasions,
    })),
    stats: {
      activeMembers: members.length,
      newMembers: members.filter((member) => member.firstTermId === termId).length,
      occasions: occasions?.n ?? 0,
      checkIns: approved?.n ?? 0,
      pointsAwarded: points?.total ?? 0,
    },
  };
}

/** Escribe el snapshot (una vez por término) y emite `term.points-closed`. Exige que no haya ocasiones abiertas. */
export async function writeTermStanding(
  ctx: CommandContext,
  termId: string,
  standing: Omit<TermStandingView, "termId" | "createdAt">,
  context: { openOccasions: number },
): Promise<{ id: string }> {
  if (context.openOccasions > 0) {
    throw new DomainError(t("T-646", { n: context.openOccasions }));
  }
  const [row] = await ctx.tx
    .insert(termStanding)
    .values({
      termId,
      topNew: standing.topNew,
      topVeteran: standing.topVeteran,
      topCommittees: standing.topCommittees,
      stats: standing.stats,
    })
    .returning({ id: termStanding.id });
  if (!row) {
    throw new Error("No se pudo guardar el cierre");
  }
  await ctx.audit({
    action: "term.standing-written",
    entityType: "term_standing",
    entityId: row.id,
    after: { termId, stats: standing.stats },
  });
  await ctx.emit({ type: "term.points-closed", payload: { termId } });
  return row;
}

export async function getTermStanding(termId: string): Promise<TermStandingView | null> {
  const [row] = await getDb()
    .select()
    .from(termStanding)
    .where(eq(termStanding.termId, termId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    termId: row.termId,
    topNew: z.array(standingPerson).catch([]).parse(row.topNew),
    topVeteran: z.array(standingPerson).catch([]).parse(row.topVeteran),
    topCommittees: z.array(standingCommittee).catch([]).parse(row.topCommittees),
    stats: standingStats
      .catch({ activeMembers: 0, newMembers: 0, occasions: 0, checkIns: 0, pointsAwarded: 0 })
      .parse(row.stats),
    createdAt: row.createdAt,
  };
}

/** Al anonimizar a una persona, su nombre congelado en los standings pasa a T-223 (ADR-030). */
export async function scrubStandingName(personId: string): Promise<number> {
  const rows = await getDb().select().from(termStanding);
  let changed = 0;
  for (const row of rows) {
    const scrub = (value: unknown) => {
      const parsed = z.array(standingPerson).safeParse(value);
      if (!parsed.success) return { value, touched: false };
      let touched = false;
      const next = parsed.data.map((item) => {
        if (item.personId !== personId || item.name === t("T-223")) return item;
        touched = true;
        return { ...item, name: t("T-223") };
      });
      return { value: next, touched };
    };
    const topNew = scrub(row.topNew);
    const topVeteran = scrub(row.topVeteran);
    if (topNew.touched || topVeteran.touched) {
      await getDb()
        .update(termStanding)
        .set({ topNew: topNew.value, topVeteran: topVeteran.value })
        .where(eq(termStanding.id, row.id));
      changed += 1;
    }
  }
  return changed;
}

/** Cifras del término antes de cerrar (resumen de /admin/cierre). */
export async function closingSummary(termId: string): Promise<{
  openOccasions: number;
  pendingCheckIns: number;
  membersWithPoints: number;
  pointsAwarded: number;
}> {
  const db = getDb();
  const termOccasions = db
    .select({ id: occasion.id })
    .from(occasion)
    .where(eq(occasion.termId, termId));
  const [open] = await db
    .select({ n: count() })
    .from(occasion)
    .where(and(eq(occasion.termId, termId), eq(occasion.status, "OPEN")));
  const [pending] = await db
    .select({ n: count() })
    .from(checkIn)
    .where(and(inArray(checkIn.occasionId, termOccasions), eq(checkIn.status, "PENDING")));
  const [members] = await db
    .select({ n: sql<number>`count(distinct ${pointEntry.personId})::int` })
    .from(pointEntry)
    .where(eq(pointEntry.termId, termId));
  const [points] = await db
    .select({ total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
    .from(pointEntry)
    .where(eq(pointEntry.termId, termId));
  return {
    openOccasions: open?.n ?? 0,
    pendingCheckIns: pending?.n ?? 0,
    membersWithPoints: members?.n ?? 0,
    pointsAwarded: points?.total ?? 0,
  };
}
