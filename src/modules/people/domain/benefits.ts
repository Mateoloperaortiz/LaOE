import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor, Tx } from "@/db/tx";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { membership, membershipTerm, sanction } from "../schema";
import { leftOnProbation } from "./leave-condition";
import { suspendedUntil } from "./sanction-pure";
import { lockMembershipCycle } from "./wallet-member";

/**
 * Prueba en cualquier comité o suspensión vigente: sin beneficios ni avales (Regl. art. 73). También
 * quien está en licencia con la prueba guardada al salir: no tiene fila en el término y sigue en
 * prueba mientras no vuelva a activo (ADR-120 regla 4; ADR-123 regla 7). La licencia sola no bloquea:
 * si debería es la decisión abierta 71.
 *
 * Son tres lecturas y no toma ningún candado: quien decide con ella dentro de un comando llega con el
 * consultivo del ciclo de membresía de la persona (`assertBenefitsAvailable`, el paso a honorario). El
 * exporte del horario preferencial la llama por el pool para muchas personas y no las retiene: lee lo
 * confirmado en cada lectura (DT-343).
 */
export async function blockedBenefits(
  personIds: string[],
  termId: string,
  now = new Date(),
  exec: Executor = getDb(),
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const day = todayKey(now);
  // Una consulta tras otra y no `Promise.all`: `exec` puede ser la transacción de un comando, que es
  // una sola conexión, y pg avisa que desde su versión 9 no acepta una consulta con otra en vuelo.
  const probations = await exec
    .select({ personId: membershipTerm.personId })
    .from(membershipTerm)
    .where(
      and(
        inArray(membershipTerm.personId, personIds),
        eq(membershipTerm.termId, termId),
        eq(membershipTerm.probation, true),
      ),
    );
  const sanctions = await exec
    .select()
    .from(sanction)
    .where(
      and(
        inArray(sanction.personId, personIds),
        isNull(sanction.revokedAt),
        gte(sanction.expiresOn, day),
      ),
    );
  const onLeave = await exec
    .select()
    .from(membership)
    .where(and(inArray(membership.personId, personIds), eq(membership.status, "ON_LEAVE")));
  const blocked = new Set(probations.map((row) => row.personId));
  for (const item of sanctions) {
    if (suspendedUntil([item], day)) blocked.add(item.personId);
  }
  for (const row of onLeave) {
    if (await leftOnProbation(exec, row)) blocked.add(row.personId);
  }
  return blocked;
}

/**
 * La puerta del reconocimiento y del aval. Toma el consultivo del ciclo de membresía de la persona
 * antes de leer (ADR-127 regla 4): sin él, el regreso de una licencia en prueba que confirmara entre
 * la primera lectura y la tercera la dejaba «no bloqueada» estando en prueba antes y después, y la
 * prueba o la suspensión que se estuviera escribiendo no se esperaba. Quien llama llega sin ninguna
 * fila de esa persona tomada: es el nivel 3 del orden del ciclo de membresía (ADR-123 regla 6).
 */
export async function assertBenefitsAvailable(
  tx: Tx,
  personId: string,
  termId: string,
  now = new Date(),
): Promise<void> {
  await lockMembershipCycle(tx, personId);
  if ((await blockedBenefits([personId], termId, now, tx)).has(personId)) {
    throw new DomainError(t("T-2331"), "personId");
  }
}
