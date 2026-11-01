import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import { canParticipate, listAvailabilityPeople, lockMembershipCycle } from "@/modules/people";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { meetingAvailability, meetingPoll } from "../schema";
import type { AvailabilityGroup } from "../types";
import { availabilityContext, availabilityGroups, requireAvailabilityGroup } from "./access";
import { compareAvailability } from "./comparison";

const pollInput = z
  .object({
    termId: z.string().min(1).max(100),
    group: z.object({ type: z.enum(["COMMITTEE", "WORK_GROUP"]), id: z.string().min(1).max(100) }),
    title: z.string().trim().min(2).max(120),
    dates: z.array(z.iso.date()).min(1).max(14),
    startMinute: z.number().int().min(0).max(1410).multipleOf(30),
    endMinute: z.number().int().min(30).max(1440).multipleOf(30),
  })
  .refine((input) => input.startMinute < input.endMinute);

const responseInput = z.object({
  pollId: z.string().min(1).max(100),
  slots: z.array(z.number().int().min(0).max(671)).max(672),
  revision: z.union([z.literal(0), z.string().min(1).max(100)]),
});

function pollGroup(poll: typeof meetingPoll.$inferSelect): Pick<AvailabilityGroup, "type" | "id"> {
  return poll.committeeId
    ? { type: "COMMITTEE", id: poll.committeeId }
    : { type: "WORK_GROUP", id: poll.workGroupId ?? "" };
}

function pollIsClosed(poll: typeof meetingPoll.$inferSelect) {
  return poll.closedAt !== null || (poll.dates.at(-1) ?? "") < todayKey();
}

/** Verifica el alcance antes de devolver cualquier título, fecha o respuesta. */
async function authorizedPoll(exec: Executor, actor: Actor, pollId: string) {
  const { member, term } = await availabilityContext(exec, actor);
  const [poll] = await exec.select().from(meetingPoll).where(eq(meetingPoll.id, pollId));
  if (!poll || !term || poll.termId !== term.id) throw new DomainError(t("T-4609"));
  const group = requireAvailabilityGroup(
    await availabilityGroups(exec, member.personId, term.id),
    pollGroup(poll),
  );
  return { poll, group, member };
}

export async function listMeetingPolls(exec: Executor, termId: string, group: AvailabilityGroup) {
  const rows = await exec
    .select()
    .from(meetingPoll)
    .where(
      and(
        eq(meetingPoll.termId, termId),
        group.type === "COMMITTEE"
          ? eq(meetingPoll.committeeId, group.id)
          : eq(meetingPoll.workGroupId, group.id),
      ),
    )
    .orderBy(desc(meetingPoll.createdAt));
  return rows.map((poll) => ({
    id: poll.id,
    title: poll.title,
    dates: poll.dates,
    closed: pollIsClosed(poll),
  }));
}

export async function createMeetingPollAs(actor: Actor, input: unknown) {
  const parsed = pollInput.safeParse(input);
  if (!parsed.success) throw new DomainError(t("T-4640"));
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-4609"));
    await lockMembershipCycle(ctx.tx, actor.personId);
    const { member, term } = await availabilityContext(ctx.tx, actor);
    if (!canParticipate(member.status)) throw new DomainError(t("T-4660"));
    if (!term || term.id !== parsed.data.termId) throw new DomainError(t("T-4610"));
    const group = requireAvailabilityGroup(
      await availabilityGroups(ctx.tx, member.personId, term.id),
      parsed.data.group,
    );
    const dates = [...new Set(parsed.data.dates)].sort();
    if (dates.some((date) => date < todayKey() || date < term.startsOn || date > term.endsOn))
      throw new DomainError(t("T-4640"));
    const [poll] = await ctx.tx
      .insert(meetingPoll)
      .values({
        termId: term.id,
        title: parsed.data.title,
        dates,
        startMinute: parsed.data.startMinute,
        endMinute: parsed.data.endMinute,
        committeeId: group.type === "COMMITTEE" ? group.id : null,
        workGroupId: group.type === "WORK_GROUP" ? group.id : null,
        createdById: member.personId,
      })
      .returning({ id: meetingPoll.id });
    if (!poll) throw new Error("No se creó la propuesta");
    await ctx.audit({
      action: "meeting-poll.created",
      entityType: "meeting_poll",
      entityId: poll.id,
      after: { termId: term.id, dates: dates.length },
    });
    return poll;
  });
}

export async function getMeetingPollAs(actor: Actor, pollId: string) {
  return getDb().transaction(
    async (tx) => {
      const { poll, group, member } = await authorizedPoll(tx, actor, pollId);
      const people = await listAvailabilityPeople(tx, group.personIds);
      const responses = people.length
        ? await tx
            .select()
            .from(meetingAvailability)
            .where(
              and(
                eq(meetingAvailability.pollId, poll.id),
                inArray(
                  meetingAvailability.personId,
                  people.map((person) => person.personId),
                ),
              ),
            )
        : [];
      return {
        termId: poll.termId,
        poll: {
          id: poll.id,
          title: poll.title,
          dates: poll.dates,
          startMinute: poll.startMinute,
          endMinute: poll.endMinute,
          closed: pollIsClosed(poll),
          canClose: poll.createdById === member.personId && canParticipate(member.status),
        },
        group: { type: group.type, id: group.id, name: group.name },
        own: responses.find((response) => response.personId === member.personId) ?? null,
        comparison: compareAvailability(people, responses, poll.dates.length * 48),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function saveMeetingAvailabilityAs(actor: Actor, input: unknown) {
  const parsed = responseInput.safeParse(input);
  if (!parsed.success) throw new DomainError(t("T-4608"));
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-4609"));
    await lockMembershipCycle(ctx.tx, actor.personId);
    // La fila de propuesta serializa respuestas y cierre, sin invertir el candado de membresía.
    await ctx.tx
      .select({ id: meetingPoll.id })
      .from(meetingPoll)
      .where(eq(meetingPoll.id, parsed.data.pollId))
      .for("update");
    const { poll, member } = await authorizedPoll(ctx.tx, actor, parsed.data.pollId);
    if (pollIsClosed(poll)) throw new DomainError(t("T-4639"));
    const slots = [...new Set(parsed.data.slots)].sort((a, b) => a - b);
    if (
      slots.some(
        (slot) =>
          slot >= poll.dates.length * 48 ||
          (slot % 48) * 30 < poll.startMinute ||
          (slot % 48) * 30 >= poll.endMinute,
      )
    )
      throw new DomainError(t("T-4608"));
    const where = and(
      eq(meetingAvailability.pollId, poll.id),
      eq(meetingAvailability.personId, member.personId),
    );
    const [before] = await ctx.tx.select().from(meetingAvailability).where(where);
    if ((before?.revision ?? 0) !== parsed.data.revision) throw new DomainError(t("T-4611"));
    const values = { slots, revision: createId() };
    const [saved] = before
      ? await ctx.tx.update(meetingAvailability).set(values).where(where).returning()
      : await ctx.tx
          .insert(meetingAvailability)
          .values({ ...values, pollId: poll.id, personId: member.personId })
          .returning();
    if (!saved) throw new Error("No se guardó la disponibilidad");
    await ctx.audit({
      action: "availability.saved",
      entityType: "meeting_availability",
      entityId: member.personId,
      after: { pollId: poll.id, blocks: slots.length },
    });
    return saved;
  });
}

export async function closeMeetingPollAs(actor: Actor, pollId: string) {
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-4609"));
    await lockMembershipCycle(ctx.tx, actor.personId);
    await ctx.tx
      .select({ id: meetingPoll.id })
      .from(meetingPoll)
      .where(eq(meetingPoll.id, pollId))
      .for("update");
    const { poll, member } = await authorizedPoll(ctx.tx, actor, pollId);
    if (poll.createdById !== member.personId || !canParticipate(member.status))
      throw new DomainError(t("T-4609"));
    if (poll.closedAt) return;
    await ctx.tx
      .update(meetingPoll)
      .set({ closedAt: new Date() })
      .where(eq(meetingPoll.id, poll.id));
    await ctx.audit({
      action: "meeting-poll.closed",
      entityType: "meeting_poll",
      entityId: poll.id,
    });
  });
}
