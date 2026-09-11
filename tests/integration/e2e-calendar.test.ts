import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { committeeMembership } from "@/modules/people/schema";
import { getCurrentTerm } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { alignSeedCalendar } from "../e2e/calendar-seed";
import { truncateAll } from "./db";
import { seedCommittee, seedPerson } from "./factories";

beforeEach(truncateAll);
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

it.each([
  ["2026-12-31T23:59:59-05:00", "2026-2"],
  ["2027-01-01T00:00:00-05:00", "2027-1"],
  ["2027-06-30T23:59:59-05:00", "2027-1"],
  ["2027-07-01T00:00:00-05:00", "2027-2"],
  ["2028-02-29T12:00:00-05:00", "2028-1"],
])("el servidor encuentra el semestre vigente con el reloj en %s", async (at, expected) => {
  await getDb()
    .insert(term)
    .values([
      { code: "2026-1", semester: 1, startsOn: "2026-01-19", endsOn: "2026-06-06" },
      { code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" },
    ]);
  const [original] = await getDb().select().from(term).where(eq(term.code, "2026-2"));
  const [previous] = await getDb().select().from(term).where(eq(term.code, "2026-1"));
  if (!original || !previous) throw new Error("Faltan los términos sintéticos de partida");
  const personId = await seedPerson("calendario@example.test");
  const committeeId = await seedCommittee("calendario");
  await getDb()
    .insert(committeeMembership)
    .values([
      { personId, committeeId, termId: original.id, joinedAt: new Date("2026-07-13T05:00:00Z") },
      {
        personId,
        committeeId,
        termId: previous.id,
        joinedAt: new Date("2026-01-19T05:00:00Z"),
        leftAt: new Date("2026-06-06T05:00:00Z"),
      },
    ]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(at));
  await alignSeedCalendar(new Date());
  const current = await getCurrentTerm();
  expect(current).toMatchObject({ id: original.id, code: expected });
  const rows = await getDb().select().from(committeeMembership);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.termId === original.id)).toMatchObject({ leftAt: null });
  const closed = rows.find((row) => row.termId === previous.id);
  expect(closed?.joinedAt).toBeInstanceOf(Date);
  expect(closed?.leftAt).toEqual(new Date(`${current?.startsOn}T00:00:00-05:00`));
  expect(closed?.leftAt?.getTime()).toBeGreaterThan(closed?.joinedAt?.getTime() ?? Infinity);
});
