import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getEventRef, isMacroeventSlug } from "@/modules/events";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { workGroup } from "../schema";
import { createGroup, setEvaluators, updateGroup } from "./groups";

export async function findMacroeventGroup(eventId: string, termId: string) {
  const [row] = await getDb()
    .select()
    .from(workGroup)
    .where(
      and(
        eq(workGroup.eventId, eventId),
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "GT_MACROEVENT"),
      ),
    );
  return row ?? null;
}

export async function prepareMacroeventGroup(ctx: CommandContext, eventId: string, termId: string) {
  const event = await getEventRef(eventId, ctx.tx);
  const term = await getTerm(termId);
  if (!event || !isMacroeventSlug(event.slug) || !term) throw new DomainError(t("T-2353"));
  if (term.permanenceClosedAt) throw new DomainError(t("T-834"));
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`macroevent:${eventId}:${termId}`}))`,
  );
  const [existing] = await ctx.tx
    .select({ id: workGroup.id })
    .from(workGroup)
    .where(
      and(
        eq(workGroup.eventId, eventId),
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "GT_MACROEVENT"),
      ),
    );
  if (existing) return existing;
  return createGroup(ctx, {
    termId,
    eventId,
    kind: "GT_MACROEVENT",
    name: `${event.name} · ${term.code}`,
  });
}

export function prepareMacroeventGroupAs(actor: Actor, eventId: string, termId: string) {
  return runCommand(actor, (ctx) => prepareMacroeventGroup(ctx, eventId, termId));
}

export function configureMacroeventGroupAs(
  actor: Actor,
  groupId: string,
  input: {
    leaderPersonId: string | undefined;
    evaluatorIds: string[];
    editionId: string | undefined;
  },
) {
  return runCommand(actor, async (ctx) => {
    const [group] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, groupId));
    if (!group || group.kind !== "GT_MACROEVENT" || !group.eventId)
      throw new DomainError(t("T-2353"));
    const term = await getTerm(group.termId);
    if (!term || term.permanenceClosedAt) throw new DomainError(t("T-834"));
    await updateGroup(ctx, groupId, {
      ...group,
      code: group.code ?? undefined,
      eventId: group.eventId,
      leaderPersonId: input.leaderPersonId,
      editionId: input.editionId,
    });
    await setEvaluators(ctx, groupId, input.evaluatorIds);
  });
}
