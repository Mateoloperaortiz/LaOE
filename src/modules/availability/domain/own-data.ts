import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import { meetingAvailability, meetingPoll, weeklyAvailability } from "../schema";

/** El exporte del titular autentica y pide paso reciente antes de componer esta proyección. */
export async function exportOwnAvailabilityData(personId: string) {
  const db = getDb();
  const [weekly, responses, polls] = await Promise.all([
    db
      .select()
      .from(weeklyAvailability)
      .where(eq(weeklyAvailability.personId, personId))
      .orderBy(asc(weeklyAvailability.termId))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select()
      .from(meetingAvailability)
      .where(eq(meetingAvailability.personId, personId))
      .orderBy(asc(meetingAvailability.pollId))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select()
      .from(meetingPoll)
      .where(eq(meetingPoll.createdById, personId))
      .orderBy(asc(meetingPoll.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  return ownDataCollections({
    weeklyAvailability: weekly,
    meetingAvailability: responses,
    meetingPolls: polls,
  });
}
