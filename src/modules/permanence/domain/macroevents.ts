import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getEventRef, isMacroeventSlug } from "@/modules/events";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { workGroup } from "../schema";
export type MacroeventGroupKind = "GT_MACROEVENT" | "GAP";

import { createGroup, setEvaluators, updateGroup } from "./groups";

export async function findMacroeventGroup(
  eventId: string,
  termId: string,
  kind: MacroeventGroupKind = "GT_MACROEVENT",
) {
  const [row] = await getDb()
    .select()
    .from(workGroup)
    .where(
      and(eq(workGroup.eventId, eventId), eq(workGroup.termId, termId), eq(workGroup.kind, kind)),
    );
  return row ?? null;
}

export async function prepareMacroeventGroup(
  ctx: CommandContext,
  eventId: string,
  termId: string,
  kind: MacroeventGroupKind = "GT_MACROEVENT",
) {
  const event = await getEventRef(eventId, ctx.tx);
  const term = await getTerm(termId);
  if (!event || !isMacroeventSlug(event.slug) || !term) throw new DomainError(t("T-2353"));
  if (term.permanenceClosedAt) throw new DomainError(t("T-834"));
  await ctx.tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`macroevent:${kind}:${eventId}:${termId}`}))`,
  );
  const [existing] = await ctx.tx
    .select({ id: workGroup.id })
    .from(workGroup)
    .where(
      and(eq(workGroup.eventId, eventId), eq(workGroup.termId, termId), eq(workGroup.kind, kind)),
    );
  if (existing) return existing;
  return createGroup(ctx, {
    termId,
    eventId,
    kind,
    name: `${kind === "GAP" ? "GAP · " : ""}${event.name} · ${term.code}`,
  });
}

export function prepareMacroeventGroupAs(
  actor: Actor,
  eventId: string,
  termId: string,
  kind: MacroeventGroupKind = "GT_MACROEVENT",
) {
  return runCommand(actor, (ctx) => prepareMacroeventGroup(ctx, eventId, termId, kind));
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
    if (!group || (group.kind !== "GT_MACROEVENT" && group.kind !== "GAP") || !group.eventId)
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
