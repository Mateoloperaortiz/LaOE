import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { membershipTerm, sanction } from "../schema";
import { suspendedUntil } from "./sanction-pure";

/** Prueba en cualquier comité o suspensión vigente: sin beneficios ni avales (Regl. art. 73). */
export async function blockedBenefits(
  personIds: string[],
  termId: string,
  now = new Date(),
  exec: Executor = getDb(),
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const day = todayKey(now);
  const [probations, sanctions] = await Promise.all([
    exec
      .select({ personId: membershipTerm.personId })
      .from(membershipTerm)
      .where(
        and(
          inArray(membershipTerm.personId, personIds),
          eq(membershipTerm.termId, termId),
          eq(membershipTerm.probation, true),
        ),
      ),
    exec
      .select()
      .from(sanction)
      .where(
        and(
          inArray(sanction.personId, personIds),
          isNull(sanction.revokedAt),
          gte(sanction.expiresOn, day),
        ),
      ),
  ]);
  const blocked = new Set(probations.map((row) => row.personId));
  for (const item of sanctions) {
    if (suspendedUntil([item], day)) blocked.add(item.personId);
  }
  return blocked;
}

export async function assertBenefitsAvailable(
  exec: Executor,
  personId: string,
  termId: string,
  now = new Date(),
): Promise<void> {
  if ((await blockedBenefits([personId], termId, now, exec)).has(personId)) {
    throw new DomainError(t("T-2331"), "personId");
  }
}
