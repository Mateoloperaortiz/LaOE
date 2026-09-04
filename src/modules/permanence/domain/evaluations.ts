import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getPeopleByIds } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { workGroup, workGroupEvaluator, workGroupMembership } from "../schema";
import { loadPermanenceConfig } from "./facts";
import { evaluationWindow } from "./permanence-pure";

// Evaluaciones de desempeño (ADR-028, ADR-036 regla 6): el evaluador del grupo dentro de la ventana,
// ADMIN en cualquier momento; insuficiente exige observación; cada evaluación va a la línea de tiempo.

export const evaluationInputSchema = z.object({
  groupId: z.string().min(1),
  personId: z.string().min(1),
  evaluation: z.enum(["GOOD", "INSUFFICIENT"]),
  note: z.string().trim().max(1000).default(""),
});
export type EvaluationInput = z.infer<typeof evaluationInputSchema>;

export interface EvaluationContext {
  isAdmin: boolean;
  /** Ids de los evaluadores del grupo, leídos afuera. */
  evaluatorIds: string[];
  /** Nombre de quien evalúa, para la línea de tiempo de la persona. */
  evaluatorName: string;
  windowOpen: boolean;
  closed: boolean;
}

export async function evaluate(
  ctx: CommandContext,
  input: EvaluationInput,
  context: EvaluationContext,
  now = new Date(),
): Promise<void> {
  if (context.closed) {
    throw new DomainError(t("T-834"));
  }
  if (!context.isAdmin) {
    if (!ctx.actor.personId || !context.evaluatorIds.includes(ctx.actor.personId)) {
      throw new DomainError(t("T-768"));
    }
    if (!context.windowOpen) {
      throw new DomainError(t("T-767"));
    }
  }
  if (input.evaluation === "INSUFFICIENT" && input.note === "") {
    throw new DomainError(t("T-766"), "note");
  }
  const [group] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, input.groupId));
  if (!group) {
    throw new DomainError(t("T-032"));
  }
  const [before] = await ctx.tx
    .select()
    .from(workGroupMembership)
    .where(
      and(
        eq(workGroupMembership.groupId, input.groupId),
        eq(workGroupMembership.personId, input.personId),
      ),
    );
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx
    .update(workGroupMembership)
    .set({
      evaluation: input.evaluation,
      note: input.note || null,
      evaluatedById: ctx.actor.personId,
      evaluatedAt: now,
    })
    .where(eq(workGroupMembership.id, before.id));
  await ctx.audit({
    action: "work-group.evaluated",
    entityType: "work_group_membership",
    entityId: before.id,
    before: { evaluation: before.evaluation, note: before.note },
    after: { evaluation: input.evaluation, note: input.note },
  });
  await ctx.emit({
    type: "evaluation.recorded",
    payload: {
      actorId: ctx.actor.personId,
      personId: input.personId,
      termId: group.termId,
      groupId: group.id,
      groupName: group.name,
      kind: group.kind,
      evaluation: input.evaluation,
      note: input.note,
      evaluatorName: context.evaluatorName,
    },
  });
  await ctx.emit({
    type: "permanence.recompute",
    payload: { termId: group.termId, personId: input.personId },
    dedupeKey: `permanence:${group.termId}:${input.personId}`,
  });
}

export async function evaluateAs(
  actor: Actor,
  input: EvaluationInput,
  editor: { isAdmin: boolean },
): Promise<void> {
  const db = getDb();
  const [group] = await db.select().from(workGroup).where(eq(workGroup.id, input.groupId)).limit(1);
  if (!group) {
    throw new DomainError(t("T-032"));
  }
  const term = await getTerm(group.termId);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  const config = await loadPermanenceConfig();
  const evaluators = await db
    .select({ personId: workGroupEvaluator.personId })
    .from(workGroupEvaluator)
    .where(eq(workGroupEvaluator.groupId, group.id));
  const people = actor.personId ? await getPeopleByIds([actor.personId]) : new Map();
  const context: EvaluationContext = {
    isAdmin: editor.isAdmin,
    evaluatorIds: evaluators.map((row) => row.personId),
    evaluatorName: actor.personId ? (people.get(actor.personId)?.fullName ?? "") : "",
    windowOpen: evaluationWindow(term, config, new Date()).open,
    closed: term.permanenceClosedAt !== null,
  };
  return runCommand(actor, (ctx) => evaluate(ctx, input, context));
}

export interface TrayMember {
  personId: string;
  name: string;
  evaluation: "PENDING" | "GOOD" | "INSUFFICIENT";
  note: string | null;
  evaluatedByName: string;
  evaluatedAt: Date | null;
}

export interface TrayGroup {
  id: string;
  name: string;
  kind: (typeof workGroup.$inferSelect)["kind"];
  code: string | null;
  pending: number;
  members: TrayMember[];
}

/** La bandeja del evaluador (o de ADMIN con todos los grupos): grupos del término con sus miembros vivos. */
export async function listEvaluationTray(
  termId: string,
  groupIds: string[] | null,
): Promise<TrayGroup[]> {
  const db = getDb();
  if (groupIds && groupIds.length === 0) {
    return [];
  }
  const groups = await db
    .select()
    .from(workGroup)
    .where(
      and(eq(workGroup.termId, termId), groupIds ? inArray(workGroup.id, groupIds) : undefined),
    )
    .orderBy(asc(workGroup.kind), asc(workGroup.name));
  if (groups.length === 0) {
    return [];
  }
  const members = await db
    .select()
    .from(workGroupMembership)
    .where(
      and(
        inArray(
          workGroupMembership.groupId,
          groups.map((group) => group.id),
        ),
        isNull(workGroupMembership.leftAt),
      ),
    )
    .orderBy(asc(workGroupMembership.evaluation), asc(workGroupMembership.joinedAt));
  const people = await getPeopleByIds([
    ...new Set(members.flatMap((row) => [row.personId, row.evaluatedById ?? ""])),
  ]);
  const name = (id: string | null) => (id ? (people.get(id)?.fullName ?? "") : "");
  return groups.map((group) => {
    const rows = members.filter((row) => row.groupId === group.id);
    return {
      id: group.id,
      name: group.name,
      kind: group.kind,
      code: group.code,
      pending: rows.filter((row) => row.evaluation === "PENDING").length,
      members: rows.map((row) => ({
        personId: row.personId,
        name: name(row.personId),
        evaluation: row.evaluation,
        note: row.note,
        evaluatedByName: name(row.evaluatedById),
        evaluatedAt: row.evaluatedAt,
      })),
    };
  });
}

/** Cuántas evaluaciones tiene pendientes una persona como evaluadora en el término. */
export async function countPendingFor(personId: string, termId: string): Promise<number> {
  const db = getDb();
  const groups = await db
    .select({ groupId: workGroupEvaluator.groupId })
    .from(workGroupEvaluator)
    .innerJoin(workGroup, eq(workGroup.id, workGroupEvaluator.groupId))
    .where(and(eq(workGroupEvaluator.personId, personId), eq(workGroup.termId, termId)));
  if (groups.length === 0) {
    return 0;
  }
  const rows = await db
    .select({ id: workGroupMembership.id })
    .from(workGroupMembership)
    .where(
      and(
        inArray(
          workGroupMembership.groupId,
          groups.map((row) => row.groupId),
        ),
        isNull(workGroupMembership.leftAt),
        eq(workGroupMembership.evaluation, "PENDING"),
      ),
    );
  return rows.length;
}
