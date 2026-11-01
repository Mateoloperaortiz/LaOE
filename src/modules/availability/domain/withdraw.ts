import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Actor, runCommand } from "@/db/tx";
import { lockMembershipCycle } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { meetingAvailability, weeklyAvailability } from "../schema";
import { availabilityContext } from "./access";

const withdrawal = z.object({
  termId: z.string().min(1).max(100),
  pollId: z.string().min(1).max(100).optional(),
  revision: z.union([z.literal(0), z.string().min(1).max(100)]),
});

/** Retirar los datos propios sigue permitido aunque la propuesta esté cerrada o se deje el grupo. */
export async function withdrawAvailabilityAs(actor: Actor, input: unknown) {
  const parsed = withdrawal.safeParse(input);
  if (!parsed.success) throw new DomainError(t("T-4608"));
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-4609"));
    await lockMembershipCycle(ctx.tx, actor.personId);
    const { member } = await availabilityContext(ctx.tx, actor);
    const { pollId, termId, revision } = parsed.data;
    const table = pollId ? meetingAvailability : weeklyAvailability;
    const where = pollId
      ? and(
          eq(meetingAvailability.personId, member.personId),
          eq(meetingAvailability.pollId, pollId),
        )
      : and(
          eq(weeklyAvailability.personId, member.personId),
          eq(weeklyAvailability.termId, termId),
        );
    const [before] = await ctx.tx.select({ revision: table.revision }).from(table).where(where);
    if ((before?.revision ?? 0) !== revision) throw new DomainError(t("T-4611"));
    await ctx.tx.delete(table).where(where);
    await ctx.audit({
      action: "availability.withdrawn",
      entityType: pollId ? "meeting_availability" : "weekly_availability",
      entityId: member.personId,
      after: pollId ? { pollId } : { termId },
    });
  });
}
