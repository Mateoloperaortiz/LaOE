import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { committeeMembershipChanged, membershipTermChanged } from "@/domain-events/people";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { committeeMembership, membershipTerm } from "../schema";
import { closeCommitteeMembership } from "./committee-membership-closing";
import { liveCommitteesPayload } from "./committee-memberships";

// Resultados del cierre de permanencia sobre la persona (ADR-036 regla 9): la condición de prueba
// para el término siguiente y la salida de un comité. Los ejecuta el job `permanence.apply-decisions`
// con el actor que confirmó la decisión; `permanence` no escribe estas tablas. La condición también la
// fija ADMIN desde la Persona 360 con motivo (ADR-056).

export const probationInputSchema = z.object({
  probation: z.boolean(),
  reason: z.string().trim().min(2).max(500),
  /** Comité al que aplica la condición; sin comité, a todos los de la persona (ADR-060 regla 2). */
  committeeId: z.string().trim().min(1).nullable().default(null),
  /** La mesa de un comité nuevo o reactivado se reporta como activa aunque sea nueva (Est. art. 5 par. 1). */
  reportAsVeteran: z.boolean().default(false),
  resumedNew: z.boolean().optional(),
  resumedTransfer: z.boolean().optional(),
  /** Constancia de la verificación académica del término, solo en el ámbito general (ADR-060 regla 13). */
  academicVerified: z.boolean().optional(),
});

export type ProbationInput = z.input<typeof probationInputSchema>;

/**
 * Fija (upsert) la condición de la persona en un término, para todos sus comités o solo para uno;
 * idempotente. La categoría es por comité (Est. art. 5 par. 2): el cierre escribe la del comité
 * donde quedó en la banda y el roster o ADMIN pueden escribir la de toda la persona.
 */
export async function setProbation(
  ctx: CommandContext,
  personId: string,
  termId: string,
  input: ProbationInput,
): Promise<void> {
  const committeeId = input.committeeId ?? null;
  const [existing] = await ctx.tx
    .select()
    .from(membershipTerm)
    .where(
      and(
        eq(membershipTerm.personId, personId),
        eq(membershipTerm.termId, termId),
        committeeId
          ? eq(membershipTerm.committeeId, committeeId)
          : isNull(membershipTerm.committeeId),
      ),
    );
  const reportAsVeteran = input.reportAsVeteran ?? false;
  const resumedNew = input.resumedNew ?? existing?.resumedNew ?? false;
  const resumedTransfer = input.resumedTransfer ?? existing?.resumedTransfer ?? false;
  const academic =
    committeeId === null && input.academicVerified !== undefined
      ? {
          academicVerifiedOn: input.academicVerified
            ? (existing?.academicVerifiedOn ?? todayKey())
            : null,
          academicVerifiedById: input.academicVerified
            ? (existing?.academicVerifiedById ?? ctx.actor.personId)
            : null,
        }
      : {};
  if (
    existing?.probation === input.probation &&
    existing.reason === input.reason &&
    existing.reportAsVeteran === reportAsVeteran &&
    existing.resumedNew === resumedNew &&
    existing.resumedTransfer === resumedTransfer &&
    (academic.academicVerifiedOn === undefined ||
      academic.academicVerifiedOn === existing.academicVerifiedOn)
  ) {
    return;
  }
  const values = {
    probation: input.probation,
    reportAsVeteran,
    resumedNew,
    resumedTransfer,
    reason: input.reason || null,
    decidedById: ctx.actor.personId,
    ...academic,
  };
  if (existing) {
    await ctx.tx.update(membershipTerm).set(values).where(eq(membershipTerm.id, existing.id));
  } else {
    await ctx.tx.insert(membershipTerm).values({ personId, termId, committeeId, ...values });
  }
  await ctx.audit({
    action: "membership-term.set",
    entityType: "person",
    entityId: personId,
    before: existing
      ? {
          probation: existing.probation,
          reportAsVeteran: existing.reportAsVeteran,
          reason: existing.reason,
          academicVerifiedOn: existing.academicVerifiedOn,
        }
      : null,
    after: { termId, committeeId, ...values },
  });
  await ctx.emit(
    eventOf(membershipTermChanged, {
      actorId: ctx.actor.personId,
      personId,
      termId,
      committeeId,
      probation: input.probation,
      reportAsVeteran,
      reason: values.reason,
    }),
  );
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
  await closeCommitteeMembership(ctx, row, now);
  const live = await liveCommitteesPayload(ctx.tx, personId, termId);
  await ctx.audit({
    action: "committee-membership.left",
    entityType: "person",
    entityId: personId,
    before: { committeeId, leftAt: null },
    after: { committeeId, termId, leftAt: now.toISOString(), reason },
  });
  await ctx.emit(
    eventOf(committeeMembershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      termId,
      committees: live,
    }),
  );
}
