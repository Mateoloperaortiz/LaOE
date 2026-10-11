import { and, desc, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/db/tx";
import { getCurrentTerm } from "@/modules/terms";
import {
  committeeMembership,
  type LeaveCondition,
  type membership,
  membershipEvent,
  membershipTerm,
} from "../schema";

// La condición con la que alguien sale a licencia (ADR-060 regla 10; ADR-118 regla 8): se congela al
// salir, se guarda en la membresía y se retoma al volver a activo. Vive aparte de `membership.ts`
// porque también la lee `benefits.ts`, que `membership.ts` importa.

type MembershipRecord = typeof membership.$inferSelect;

/** Congela la condición al salir; una edición posterior del término no la modifica. */
export async function conditionAtDeparture(
  exec: Executor,
  current: MembershipRecord,
  when: Date,
): Promise<LeaveCondition[]> {
  const term = await getCurrentTerm(when);
  if (!term) return [];
  const rows = await exec
    .select()
    .from(membershipTerm)
    .where(and(eq(membershipTerm.personId, current.personId), eq(membershipTerm.termId, term.id)));
  const conditions: LeaveCondition[] = rows.map((row) => ({
    committeeId: row.committeeId,
    probation: row.probation,
    reportAsVeteran: row.reportAsVeteran,
    resumedNew: row.resumedNew,
    resumedTransfer: row.resumedTransfer,
  }));
  const transfers = await exec
    .select({ committeeId: committeeMembership.committeeId })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, current.personId),
        eq(committeeMembership.termId, term.id),
        eq(committeeMembership.transferredIn, true),
        isNull(committeeMembership.leftAt),
      ),
    );
  for (const transfer of transfers) {
    const scope = conditions.find((row) => row.committeeId === transfer.committeeId);
    if (scope) scope.resumedTransfer = true;
    else
      conditions.push({
        committeeId: transfer.committeeId,
        probation: false,
        reportAsVeteran: false,
        resumedNew: false,
        resumedTransfer: true,
      });
  }
  const general = conditions.find((row) => row.committeeId === null);
  if (general) general.resumedNew ||= current.firstTermId === term.id;
  else
    conditions.push({
      committeeId: null,
      probation: false,
      reportAsVeteran: false,
      resumedNew: current.firstTermId === term.id,
    });
  return conditions;
}

/** La condición guardada al salir a licencia; las licencias anteriores a la migración se reconstruyen. */
export async function savedCondition(
  exec: Executor,
  current: MembershipRecord,
): Promise<LeaveCondition[]> {
  if (current.leaveCondition !== null) return current.leaveCondition;
  // Licencias anteriores a la migración: reconstruir desde el término de la salida registrada.
  const [departure] = await exec
    .select({ at: membershipEvent.at })
    .from(membershipEvent)
    .where(
      and(eq(membershipEvent.membershipId, current.id), eq(membershipEvent.toStatus, "ON_LEAVE")),
    )
    .orderBy(desc(membershipEvent.at))
    .limit(1);
  return departure ? conditionAtDeparture(exec, current, departure.at) : [];
}

/**
 * La prueba con la que alguien salió a licencia sigue siendo prueba mientras no vuelva a activo
 * (ADR-120 regla 4): vive en la condición guardada y no en las filas del término vigente. Cuenta la
 * general y la de cualquier comité, como las filas del término en `blockedBenefits`, que la suma a
 * las suyas (ADR-123 regla 7).
 */
export async function leftOnProbation(exec: Executor, current: MembershipRecord): Promise<boolean> {
  if (current.status !== "ON_LEAVE") return false;
  return (await savedCondition(exec, current)).some((condition) => condition.probation);
}
