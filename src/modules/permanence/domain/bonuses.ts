import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { lockMembershipCycle, lockPersonAnonymization } from "@/modules/people";
import { lockTermPoints } from "@/modules/terms";
import { t } from "@/shared/copy";
import { errorCode } from "@/shared/lib/error-sanitizer";
import { DomainError } from "@/shared/lib/errors";
import { MAX_INPUT_COLLECTION_ITEMS } from "@/shared/lib/input-collections";
import { permanenceBonus, permanenceBonusAllocation, permanenceRule } from "../schema";
import { loadPeopleFacts, loadTermFacts } from "./facts";
import { type CriterionResult, computePerson, round2 } from "./permanence-pure";
import { lockTermSnapshots, saveSnapshot } from "./snapshots";

const id = z.string().regex(/^[a-z0-9-]+$/);
export const permanenceBonusInputSchema = z.object({
  termId: id,
  personId: id,
  ruleIds: z
    .array(id)
    .min(1)
    .max(MAX_INPUT_COLLECTION_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length),
  total: z.number().positive().multipleOf(0.01),
  reason: z.string().trim().min(1).max(1000),
  requestId: z.uuid(),
});

type BonusInput = z.infer<typeof permanenceBonusInputSchema>;

function gaps(criteria: CriterionResult[]) {
  return criteria.flatMap((criterion) => {
    const missing = Math.round((criterion.weight - criterion.achieved) * 100);
    return missing > 0 ? [{ ruleId: criterion.ruleId, label: criterion.label, missing }] : [];
  });
}

function eligibleGroups(result: ReturnType<typeof computePerson>) {
  return [
    { committeeId: null, criteria: gaps(result.general) },
    ...result.results.map((item) => ({
      committeeId: item.committeeId,
      criteria: gaps(item.criteria),
    })),
  ].filter((group) => group.criteria.length > 0);
}

export function previewPermanenceBonus(termId: string, personId: string) {
  return getDb().transaction(
    async (tx) => {
      const facts = await loadTermFacts(termId, tx);
      if (!facts || facts.term.permanenceClosedAt) return null;
      const [person] = await loadPeopleFacts(facts, [personId], tx);
      if (!person) return null;
      const result = computePerson(facts, person, new Date());
      return result.evaluated ? eligibleGroups(result) : null;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export type PermanenceBonusGroup = ReturnType<typeof eligibleGroups>[number];

async function wasGranted({ tx, actor }: CommandContext, input: BonusInput): Promise<boolean> {
  const rows = await tx
    .select({
      actorId: permanenceBonus.grantedById,
      reason: permanenceBonus.reason,
      ruleId: permanenceBonusAllocation.ruleId,
      value: permanenceBonusAllocation.value,
    })
    .from(permanenceBonus)
    .innerJoin(permanenceBonusAllocation, eq(permanenceBonusAllocation.bonusId, permanenceBonus.id))
    .where(
      and(
        eq(permanenceBonus.termId, input.termId),
        eq(permanenceBonus.personId, input.personId),
        eq(permanenceBonus.requestId, input.requestId),
      ),
    );
  const [first] = rows;
  if (!first) return false;
  if (
    first.actorId !== actor.personId ||
    first.reason !== input.reason ||
    round2(rows.reduce((total, row) => total + row.value, 0)) !== input.total ||
    rows.length !== input.ruleIds.length ||
    rows.some((row) => !input.ruleIds.includes(row.ruleId))
  ) {
    throw new DomainError(t("T-4870"));
  }
  return true;
}

export async function grantPermanenceBonusAs(
  actor: Actor & { personId: string },
  input: BonusInput,
): Promise<void> {
  const parsed = permanenceBonusInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError(t("T-4867"));
  // La foto de Repeatable Read puede empezar antes de que termine una espera. Si el cierre u otro
  // bono cambió la fila que se va a guardar, PostgreSQL devuelve 40001. Se retoma con otra foto.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runCommand(actor, (ctx) => grantBonus(ctx, parsed.data), {
        isolationLevel: "repeatable read",
      });
    } catch (error) {
      if (!(error instanceof Error) || errorCode(error) !== "40001") throw error;
      if (attempt === 3) throw new DomainError(t("T-4866"));
    }
  }
}

async function grantBonus(ctx: CommandContext, input: BonusInput): Promise<void> {
  const { termId, personId, ruleIds, total, reason, requestId } = input;
  const { tx, actor } = ctx;
  await lockTermSnapshots(tx, termId);
  if (await wasGranted(ctx, input)) return;

  const term = await lockTermPoints(tx, termId);
  if (term.permanenceClosedAt) throw new DomainError(t("T-834"));
  const member = await lockMembershipCycle(tx, personId, { lockStatus: true });
  const personState = await lockPersonAnonymization(tx, personId);
  if (member?.status !== "ACTIVE" || personState?.anonymized !== false) {
    throw new DomainError(t("T-4863"));
  }
  // El peso y la aplicabilidad de los criterios elegidos se conservan hasta registrar el bono.
  await tx
    .select({ id: permanenceRule.id })
    .from(permanenceRule)
    .where(and(eq(permanenceRule.termId, termId), inArray(permanenceRule.id, ruleIds)))
    .orderBy(asc(permanenceRule.id))
    .for("share");
  const facts = await loadTermFacts(term, tx);
  const [person] = await loadPeopleFacts(facts, [personId], tx);
  if (!person) throw new DomainError(t("T-4863"));

  const now = new Date();
  const selected = new Set(ruleIds);
  const allocations = eligibleGroups(computePerson(facts, person, now))
    .flatMap((group) => group.criteria)
    .filter((criterion) => selected.has(criterion.ruleId));
  if (allocations.length !== selected.size) throw new DomainError(t("T-4866"));
  const required = allocations.reduce((sum, criterion) => sum + criterion.missing, 0);
  if (Math.round(total * 100) !== required) {
    throw new DomainError(
      t("T-4865", { n: new Intl.NumberFormat("es-CO").format(required / 100) }),
      "total",
    );
  }

  const [bonus] = await tx
    .insert(permanenceBonus)
    .values({ termId, personId, requestId, reason, grantedById: actor.personId })
    .onConflictDoNothing({
      target: [permanenceBonus.personId, permanenceBonus.termId, permanenceBonus.requestId],
    })
    .returning({ id: permanenceBonus.id });
  if (!bonus) throw new Error("sin bono de permanencia");
  const credits = allocations.map(({ ruleId, missing }) => ({ ruleId, value: missing / 100 }));
  await tx
    .insert(permanenceBonusAllocation)
    .values(credits.map((credit) => ({ ...credit, bonusId: bonus.id })));
  await ctx.audit({
    action: "permanence-bonus.granted",
    entityType: "permanence_bonus",
    entityId: bonus.id,
    after: { termId, personId, total, allocations: credits },
  });
  person.bonuses.push(...credits.map((credit) => ({ ...credit, id: bonus.id, reason })));
  await saveSnapshot(tx, termId, computePerson(facts, person, now), now);
}
