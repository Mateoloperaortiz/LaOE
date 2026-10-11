import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { membership, membershipTerm, sanction } from "../schema";
import { leftOnProbation } from "./leave-condition";
import { suspendedUntil } from "./sanction-pure";

/**
 * Prueba en cualquier comité o suspensión vigente: sin beneficios ni avales (Regl. art. 73). También
 * quien está en licencia con la prueba guardada al salir: no tiene fila en el término y sigue en
 * prueba mientras no vuelva a activo (ADR-120 regla 4; ADR-123 regla 7). La licencia sola no bloquea:
 * si debería es la decisión abierta 71.
 */
export async function blockedBenefits(
  personIds: string[],
  termId: string,
  now = new Date(),
  exec: Executor = getDb(),
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const day = todayKey(now);
  const [probations, sanctions, onLeave] = await Promise.all([
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
    exec
      .select()
      .from(membership)
      .where(and(inArray(membership.personId, personIds), eq(membership.status, "ON_LEAVE"))),
  ]);
  const blocked = new Set(probations.map((row) => row.personId));
  for (const item of sanctions) {
    if (suspendedUntil([item], day)) blocked.add(item.personId);
  }
  for (const row of onLeave) {
    if (await leftOnProbation(exec, row)) blocked.add(row.personId);
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
