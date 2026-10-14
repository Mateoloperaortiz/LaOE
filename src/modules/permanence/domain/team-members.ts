import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { permanenceRecompute } from "@/domain-events/permanence";
import { getEventRef, isMacroeventSlug, listMacroevents } from "@/modules/events";
import { listMembershipStatuses } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { workGroup, workGroupMembership } from "../schema";
import { evaluate, loadEvaluationContext } from "./evaluations";
import { addMembers } from "./groups";
import { macroeventAreas, TEAM_AREA_CODES, teamAreaLabel } from "./team-areas";

export const teamMemberInputSchema = z.object({
  personId: z.string().min(1),
  areas: z
    .array(z.enum(TEAM_AREA_CODES))
    .min(1)
    .max(11)
    .transform((items) => [...new Set(items)]),
  credit: z.boolean().default(false),
});

/** Una sola transacción registra áreas y, solo si se solicita, acredita desempeño. */
export async function saveMacroeventMemberAs(
  actor: Actor,
  groupId: string,
  raw: z.input<typeof teamMemberInputSchema>,
  editor: { isAdmin: boolean },
) {
  if (!editor.isAdmin || !actor.personId) throw new DomainError(t("T-768"));
  const input = teamMemberInputSchema.parse(raw);
  const refs = await listMembershipStatuses([input.personId]);
  const statuses = new Map(
    [...refs].map(([id, ref]) => [id, { name: ref.fullName, status: ref.status }]),
  );
  const evaluation = input.credit ? await loadEvaluationContext(actor, groupId, editor) : null;
  return runCommand(actor, async (ctx) => {
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`team-member:${groupId}:${input.personId}`}))`,
    );
    const [group] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, groupId));
    if (!group?.eventId || !["GT_MACROEVENT", "GAP"].includes(group.kind))
      throw new DomainError(t("T-2353"));
    const term = await getTerm(group.termId);
    if (!term || term.permanenceClosedAt) throw new DomainError(t("T-834"));
    const event = await getEventRef(group.eventId, ctx.tx);
    if (
      !event ||
      !isMacroeventSlug(event.slug) ||
      input.areas.some((area) => !macroeventAreas(event.slug).some((item) => item.code === area))
    )
      throw new DomainError(t("T-2384"));
    const match = and(
      eq(workGroupMembership.groupId, groupId),
      eq(workGroupMembership.personId, input.personId),
    );
    const [before] = await ctx.tx.select().from(workGroupMembership).where(match);
    // Entrar y volver van por el mismo camino que en las demás pantallas (ADR-116 regla 5; ADR-119
    // regla 21): quien había salido vuelve a su pertenencia con la fecha de ingreso que tenía y
    // pendiente de una evaluación nueva, y la anterior queda en la auditoría de su regreso.
    if (!before || before.leftAt) {
      await addMembers(ctx, groupId, [input.personId], { statuses });
    }
    const [saved] = await ctx.tx
      .update(workGroupMembership)
      .set({ areas: input.areas })
      .where(match)
      .returning({ id: workGroupMembership.id });
    if (!saved) throw new DomainError(t("T-032"));
    await ctx.audit({
      action: "work-group.member-areas-set",
      entityType: "work_group_membership",
      entityId: saved.id,
      before: before
        ? { areas: before.areas, leftAt: before.leftAt, evaluation: before.evaluation }
        : null,
      after: { areas: input.areas, rejoined: !!before?.leftAt },
    });
    if (evaluation)
      await evaluate(
        ctx,
        { groupId, personId: input.personId, evaluation: "GOOD", note: "" },
        evaluation,
      );
    await ctx.emit(
      eventOf(
        permanenceRecompute,
        { termId: group.termId, personId: input.personId },
        { dedupeKey: `permanence:${group.termId}:${input.personId}` },
      ),
    );
  });
}

export interface TeamParticipation {
  groupId: string;
  label: string;
  evaluation: "PENDING" | "GOOD" | "INSUFFICIENT";
}

/** Lectura en lote; el llamador ya filtró consentimiento y acceso a las personas. */
export async function listTeamParticipations(
  personIds: string[],
  termId: string,
): Promise<Map<string, TeamParticipation[]>> {
  const result = new Map<string, TeamParticipation[]>();
  if (!personIds.length) return result;
  const [rows, events] = await Promise.all([
    getDb()
      .select({
        personId: workGroupMembership.personId,
        groupId: workGroup.id,
        name: workGroup.name,
        kind: workGroup.kind,
        eventId: workGroup.eventId,
        areas: workGroupMembership.areas,
        evaluation: workGroupMembership.evaluation,
      })
      .from(workGroupMembership)
      .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
      .where(
        and(
          inArray(workGroupMembership.personId, personIds),
          eq(workGroup.termId, termId),
          isNull(workGroupMembership.leftAt),
          inArray(workGroup.kind, ["GT_MACROEVENT", "GAP", "GAP_OE"]),
        ),
      )
      .orderBy(asc(workGroup.name)),
    listMacroevents(),
  ]);
  for (const row of rows) {
    const kind = row.kind === "GT_MACROEVENT" ? "GT" : row.kind === "GAP_OE" ? "GAP OE" : "GAP";
    const eventName = events.find((event) => event.id === row.eventId)?.name ?? row.name;
    const labels = row.areas.length
      ? row.areas.map((area) => `${kind} · ${teamAreaLabel(area)} · ${eventName}`)
      : [`${kind} · ${eventName}`];
    const items = result.get(row.personId) ?? [];
    items.push(
      ...labels.map((label) => ({ groupId: row.groupId, label, evaluation: row.evaluation })),
    );
    result.set(row.personId, items);
  }
  return result;
}
