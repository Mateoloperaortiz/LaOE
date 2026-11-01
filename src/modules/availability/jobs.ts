import { eq } from "drizzle-orm";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { lockMembershipCycle } from "@/modules/people";
import { t } from "@/shared/copy";
import { meetingAvailability, meetingPoll, weeklyAvailability } from "./schema";

onEvent(personAnonymized, async ({ personId }) => {
  await runCommand(SYSTEM_ACTOR, async ({ tx }) => {
    await lockMembershipCycle(tx, personId);
    await tx.delete(weeklyAvailability).where(eq(weeklyAvailability.personId, personId));
    await tx.delete(meetingAvailability).where(eq(meetingAvailability.personId, personId));
    await tx
      .update(meetingPoll)
      .set({ createdById: null, title: t("T-4680") })
      .where(eq(meetingPoll.createdById, personId));
  });
});
