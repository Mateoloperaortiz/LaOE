import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { committeeMembership } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { calendarFor } from "./calendar";

/** Adapta los ejemplos históricos del seed, sin tocar el seed de desarrollo ni fechas de la OE. */
export async function alignSeedCalendar(now: Date): Promise<void> {
  const calendar = calendarFor(now);
  await getDb().transaction(async (tx) => {
    const originals = await tx
      .select()
      .from(term)
      .where(inArray(term.code, ["2026-1", "2026-2"]));
    if (originals.length !== 2) throw new Error("Faltan los dos términos del seed E2E");
    // Nombres temporales válidos para resolver, por ejemplo, 2026-2 → 2027-1 y 2026-1 → 2026-2.
    for (const [index, original] of originals.entries()) {
      await tx
        .update(term)
        .set({ code: `1998-${index + 1}` })
        .where(eq(term.id, original.id));
    }
    for (const original of originals) {
      const dates = original.code === "2026-2" ? calendar.current : calendar.previous;
      await tx.update(term).set(dates).where(eq(term.id, original.id));
      const endExclusive = new Date(`${dates.endsOn}T00:00:00-05:00`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      await tx
        .update(committeeMembership)
        .set({
          joinedAt: new Date(`${dates.startsOn}T00:00:00-05:00`),
          leftAt: sql`case when ${committeeMembership.leftAt} is null then null else ${endExclusive.toISOString()}::timestamptz end`,
        })
        .where(eq(committeeMembership.termId, original.id));
    }
  });
}
