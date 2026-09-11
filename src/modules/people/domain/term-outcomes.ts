import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { committeeMembership, membershipTerm } from "../schema";

// Resultados del cierre de permanencia sobre la persona (ADR-036 regla 9): la condición de prueba
// para el término siguiente y la salida de un comité. Los ejecuta el job `permanence.apply-decisions`
// con el actor que confirmó la decisión; `permanence` no escribe estas tablas. La condición también la
// fija ADMIN desde la Persona 360 con motivo (ADR-056).

export const probationInputSchema = z.object({
  probation: z.boolean(),
  reason: z.string().trim().min(2).max(500),
});

export type ProbationInput = z.infer<typeof probationInputSchema>;

/** Fija (upsert) la condición de la persona en un término; idempotente. */
export async function setProbation(
  ctx: CommandContext,
  personId: string,
  termId: string,
  input: ProbationInput,
): Promise<void> {
  const [existing] = await ctx.tx
    .select()
    .from(membershipTerm)
    .where(and(eq(membershipTerm.personId, personId), eq(membershipTerm.termId, termId)));
  if (existing?.probation === input.probation && existing.reason === input.reason) {
    return;
  }
  const values = {
    probation: input.probation,
    reason: input.reason || null,
    decidedById: ctx.actor.personId,
  };
  if (existing) {
    await ctx.tx.update(membershipTerm).set(values).where(eq(membershipTerm.id, existing.id));
  } else {
    await ctx.tx.insert(membershipTerm).values({ personId, termId, ...values });
  }
  await ctx.audit({
    action: "membership-term.set",
    entityType: "person",
    entityId: personId,
    before: existing ? { probation: existing.probation, reason: existing.reason } : null,
    after: { termId, ...values },
  });
  await ctx.emit({
    type: "membership-term.changed",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      termId,
      probation: input.probation,
      reason: values.reason,
    },
  });
}

/** Estampa `leftAt` en la pertenencia viva de la persona en ese comité y término; idempotente. */
export async function leaveCommittee(
  ctx: CommandContext,
  personId: string,
  committeeId: string,
  termId: string,
  reason: string,
  now = new Date(),
): Promise<void> {
  const [row] = await ctx.tx
    .select()
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.committeeId, committeeId),
        eq(committeeMembership.termId, termId),
      ),
    );
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.leftAt !== null) {
    return;
  }
  await ctx.tx
    .update(committeeMembership)
    .set({ leftAt: now })
    .where(eq(committeeMembership.id, row.id));
  const live = await ctx.tx
    .select({
      committeeId: committeeMembership.committeeId,
      roleCode: committeeMembership.roleCode,
      transferredIn: committeeMembership.transferredIn,
    })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
      ),
    );
  await ctx.audit({
    action: "committee-membership.left",
    entityType: "person",
    entityId: personId,
    before: { committeeId, leftAt: null },
    after: { committeeId, termId, leftAt: now.toISOString(), reason },
  });
  await ctx.emit({
    type: "committee-membership.changed",
    payload: { actorId: ctx.actor.personId, personId, termId, committees: live },
  });
}
