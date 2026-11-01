import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { listAvailabilityPeople, lockMembershipCycle } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { weeklyAvailability } from "../schema";
import type { AvailabilityGroup } from "../types";
import { availabilityContext, availabilityGroups, requireAvailabilityGroup } from "./access";
import { compareAvailability } from "./comparison";
import { listMeetingPolls } from "./polls";

const weeklyInput = z.object({
  termId: z.string().min(1).max(100),
  slots: z.array(z.number().int().min(0).max(335)).max(336),
  revision: z.union([z.literal(0), z.string().min(1).max(100)]),
});

export async function getAvailabilityAs(
  actor: Actor,
  selection: { group?: Pick<AvailabilityGroup, "type" | "id"> } = {},
) {
  return getDb().transaction(
    async (tx) => {
      const { member, term } = await availabilityContext(tx, actor);
      const [own] = term
        ? await tx
            .select()
            .from(weeklyAvailability)
            .where(
              and(
                eq(weeklyAvailability.personId, member.personId),
                eq(weeklyAvailability.termId, term.id),
              ),
            )
        : [];
      const groups = term ? await availabilityGroups(tx, member.personId, term.id) : [];
      const selected = selection.group ? requireAvailabilityGroup(groups, selection.group) : null;
      const people = selected ? await listAvailabilityPeople(tx, selected.personIds) : [];
      const responses =
        selected && term && people.length > 0
          ? await tx
              .select({ personId: weeklyAvailability.personId, slots: weeklyAvailability.slots })
              .from(weeklyAvailability)
              .where(
                and(
                  eq(weeklyAvailability.termId, term.id),
                  inArray(
                    weeklyAvailability.personId,
                    people.map((person) => person.personId),
                  ),
                ),
              )
          : [];
      return {
        term: term ? { id: term.id, code: term.code, endsOn: term.endsOn } : null,
        own: own ?? null,
        groups: groups.map(({ personIds: _personIds, ...group }) => group),
        comparison: selected ? compareAvailability(people, responses, 336) : null,
        polls: selected && term ? await listMeetingPolls(tx, term.id, selected) : [],
        canCreate: member.status !== "ON_LEAVE",
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function saveAvailabilityAs(actor: Actor, input: unknown) {
  const parsed = weeklyInput.safeParse(input);
  if (!parsed.success) throw new DomainError(t("T-4608"));
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-4609"));
    await lockMembershipCycle(ctx.tx, actor.personId);
    const { member, term } = await availabilityContext(ctx.tx, actor);
    if (!term || term.id !== parsed.data.termId) throw new DomainError(t("T-4610"));
    const where = and(
      eq(weeklyAvailability.personId, member.personId),
      eq(weeklyAvailability.termId, term.id),
    );
    const [before] = await ctx.tx.select().from(weeklyAvailability).where(where);
    if ((before?.revision ?? 0) !== parsed.data.revision) throw new DomainError(t("T-4611"));
    const values = {
      slots: [...new Set(parsed.data.slots)].sort((a, b) => a - b),
      revision: createId(),
    };
    const [saved] = before
      ? await ctx.tx.update(weeklyAvailability).set(values).where(where).returning()
      : await ctx.tx
          .insert(weeklyAvailability)
          .values({ ...values, personId: member.personId, termId: term.id })
          .returning();
    if (!saved) throw new Error("No se guardó la disponibilidad");
    await ctx.audit({
      action: "availability.saved",
      entityType: "weekly_availability",
      entityId: member.personId,
      after: { termId: term.id, blocks: values.slots.length },
    });
    return saved;
  });
}
