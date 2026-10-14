import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import {
  leaderScoreRecorded,
  manualCreditGranted,
  permanenceRecompute,
} from "@/domain-events/permanence";
import { isInInternalRoster } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { leaderScore, manualCredit, permanenceRule } from "../schema";
import { getRule, rulesWhere, type TableRef } from "./rules";

// Puntajes del líder (ADR-026) y créditos manuales de GH (ADR-025): siempre acotados al peso del
// criterio, con observación o motivo, y con recompute de la persona. El líder solo puntúa criterios de
// la tabla que autorizó la página (ADR-036 regla 7, ADR-072).

export const leaderScoreInputSchema = z.object({
  ruleId: z.string().min(1),
  personId: z.string().min(1),
  value: z.number().min(0),
  note: z.string().trim().max(1000).default(""),
});
export type LeaderScoreInput = z.infer<typeof leaderScoreInputSchema>;

/**
 * Los nombres son solo para el texto del error. Que la persona esté en el comité no llega de afuera:
 * lo lee el comando en su transacción (ADR-122 regla 2).
 */
export interface LeaderScoreContext {
  personName: string;
  committeeName: string;
  closed: boolean;
}

function recompute(ctx: CommandContext, termId: string, personId: string) {
  return ctx.emit(
    eventOf(
      permanenceRecompute,
      { termId, personId },
      { dedupeKey: `permanence:${termId}:${personId}` },
    ),
  );
}

export async function scoreCriterion(
  ctx: CommandContext,
  ref: TableRef,
  input: LeaderScoreInput,
  context: LeaderScoreContext,
  now = new Date(),
): Promise<void> {
  if (context.closed) {
    throw new DomainError(t("T-834"));
  }
  // Un criterio de otra tabla o de otro término responde igual que uno inexistente (ADR-072).
  const [rule] = await ctx.tx
    .select()
    .from(permanenceRule)
    .where(and(eq(permanenceRule.id, input.ruleId), rulesWhere(ref)));
  if (!rule || rule.computation !== "LEADER_SCORE") {
    throw new DomainError(t("T-777"));
  }
  // ADR-122 regla 2: que la persona esté en el roster del comité se lee aquí, con el comité y el
  // término de la regla, que ya salió filtrada por la tabla de la página. La tabla general no tiene
  // comité y por eso no tiene a quién puntuar.
  const inCommittee =
    rule.committeeId !== null &&
    (await isInInternalRoster(ctx.tx, input.personId, {
      committeeId: rule.committeeId,
      termId: rule.termId,
    }));
  if (!inCommittee) {
    throw new DomainError(
      t("T-776", { nombre: context.personName, comité: context.committeeName }),
    );
  }
  if (input.value > rule.weight) {
    throw new DomainError(t("T-774", { peso: rule.weight }), "value");
  }
  if (input.value < rule.weight && input.note === "") {
    throw new DomainError(t("T-775"), "note");
  }
  const values = {
    termId: rule.termId,
    personId: input.personId,
    ruleId: rule.id,
    value: input.value,
    note: input.note || null,
    scoredById: ctx.actor.personId,
    scoredAt: now,
  };
  await ctx.tx
    .insert(leaderScore)
    .values(values)
    .onConflictDoUpdate({ target: [leaderScore.ruleId, leaderScore.personId], set: values });
  await ctx.audit({
    action: "leader-score.recorded",
    entityType: "leader_score",
    entityId: `${rule.id}:${input.personId}`,
    after: { value: input.value, note: input.note },
  });
  await ctx.emit(
    eventOf(leaderScoreRecorded, {
      actorId: ctx.actor.personId,
      personId: input.personId,
      termId: rule.termId,
      committeeId: rule.committeeId,
      ruleId: rule.id,
      criterion: rule.label,
      value: input.value,
      weight: rule.weight,
      note: input.note,
    }),
  );
  await recompute(ctx, rule.termId, input.personId);
}

export const manualCreditInputSchema = z.object({
  ruleId: z.string().min(1),
  personId: z.string().min(1),
  value: z.number().min(0),
  reason: z.string().trim().min(1).max(1000),
});
export type ManualCreditInput = z.infer<typeof manualCreditInputSchema>;

export async function grantManualCredit(
  ctx: CommandContext,
  input: ManualCreditInput,
  context: { closed: boolean },
): Promise<void> {
  if (context.closed) {
    throw new DomainError(t("T-834"));
  }
  const [rule] = await ctx.tx
    .select()
    .from(permanenceRule)
    .where(eq(permanenceRule.id, input.ruleId));
  if (!rule) {
    throw new DomainError(t("T-032"));
  }
  if (rule.computation !== "MANUAL") {
    throw new DomainError(t("T-787"), "ruleId");
  }
  if (input.value > rule.weight) {
    throw new DomainError(t("T-774", { peso: rule.weight }), "value");
  }
  const values = {
    termId: rule.termId,
    personId: input.personId,
    ruleId: rule.id,
    value: input.value,
    reason: input.reason,
    grantedById: ctx.actor.personId,
  };
  await ctx.tx
    .insert(manualCredit)
    .values(values)
    .onConflictDoUpdate({ target: [manualCredit.ruleId, manualCredit.personId], set: values });
  await ctx.audit({
    action: "manual-credit.granted",
    entityType: "manual_credit",
    entityId: `${rule.id}:${input.personId}`,
    after: { value: input.value, reason: input.reason },
  });
  await ctx.emit(
    eventOf(manualCreditGranted, {
      actorId: ctx.actor.personId,
      personId: input.personId,
      termId: rule.termId,
      ruleId: rule.id,
      criterion: rule.label,
      value: input.value,
      weight: rule.weight,
      reason: input.reason,
    }),
  );
  await recompute(ctx, rule.termId, input.personId);
}

export interface LeaderScoreView {
  ruleId: string;
  personId: string;
  value: number;
  note: string | null;
  scoredAt: Date;
}

/** Puntajes de los criterios de un comité en el término, para la vista del líder. */
export async function listLeaderScores(
  termId: string,
  committeeId: string,
): Promise<LeaderScoreView[]> {
  const rules = await getDb()
    .select({ id: permanenceRule.id })
    .from(permanenceRule)
    .where(and(eq(permanenceRule.termId, termId), eq(permanenceRule.committeeId, committeeId)));
  if (rules.length === 0) {
    return [];
  }
  return getDb()
    .select({
      ruleId: leaderScore.ruleId,
      personId: leaderScore.personId,
      value: leaderScore.value,
      note: leaderScore.note,
      scoredAt: leaderScore.scoredAt,
    })
    .from(leaderScore)
    .where(
      inArray(
        leaderScore.ruleId,
        rules.map((rule) => rule.id),
      ),
    );
}

export interface ManualCreditView {
  ruleId: string;
  label: string;
  weight: number;
  value: number;
  reason: string;
  createdAt: Date;
}

export async function listManualCredits(
  termId: string,
  personId: string,
): Promise<ManualCreditView[]> {
  return getDb()
    .select({
      ruleId: manualCredit.ruleId,
      label: permanenceRule.label,
      weight: permanenceRule.weight,
      value: manualCredit.value,
      reason: manualCredit.reason,
      createdAt: manualCredit.createdAt,
    })
    .from(manualCredit)
    .innerJoin(permanenceRule, eq(permanenceRule.id, manualCredit.ruleId))
    .where(and(eq(manualCredit.termId, termId), eq(manualCredit.personId, personId)));
}

// Wrappers: leen el término y, en los créditos de GH, la regla antes de la transacción.

/**
 * `ref` es la tabla del comité que autorizó la página (ADR-072). `names` trae solo los nombres para
 * el texto del error: que la persona sea del comité lo lee el comando (ADR-122 regla 2).
 */
export async function scoreCriterionAs(
  actor: Actor,
  ref: TableRef,
  input: LeaderScoreInput,
  names: { personName: string; committeeName: string },
): Promise<void> {
  const term = await getTerm(ref.termId);
  const context: LeaderScoreContext = {
    personName: names.personName,
    committeeName: names.committeeName,
    closed: term?.permanenceClosedAt !== null,
  };
  return runCommand(actor, (ctx) => scoreCriterion(ctx, ref, input, context));
}

export async function grantManualCreditAs(actor: Actor, input: ManualCreditInput): Promise<void> {
  const rule = await getRule(input.ruleId);
  if (!rule) {
    throw new DomainError(t("T-032"));
  }
  const term = await getTerm(rule.termId);
  return runCommand(actor, (ctx) =>
    grantManualCredit(ctx, input, { closed: term?.permanenceClosedAt !== null }),
  );
}
