import { eq, sql } from "drizzle-orm";
import { type CommandContext, type Executor, runCommand, SYSTEM_ACTOR, type Tx } from "@/db/tx";
import { membership, person } from "../schema";
import type { MembershipStatus } from "./reads";

/** Estado vigente que identity y wallet usan sin conocer las tablas de people. */
export interface WalletMemberState {
  personId: string;
  status: MembershipStatus;
  walletEpoch: number;
  anonymizedAt: Date | null;
}

export async function getWalletMemberState(
  exec: Executor,
  personId: string,
): Promise<WalletMemberState | null> {
  const [row] = await exec
    .select({
      personId: person.id,
      status: membership.status,
      walletEpoch: membership.walletEpoch,
      anonymizedAt: person.anonymizedAt,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId))
    .limit(1);
  return row ?? null;
}

/** El prefijo de la clave del candado consultivo del ciclo de membresía: `wallet-member:<persona>`. */
const LOCK_PREFIX = "wallet-member:";

/**
 * Serializa el ciclo de membresía con la emisión y rotación de credenciales. Se adquiere antes de
 * cualquier lock de filas y solo dentro de transacciones cortas: nunca cubre llamadas a Google.
 */
export async function lockWalletMember(
  tx: Tx,
  personId: string,
): Promise<WalletMemberState | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${LOCK_PREFIX}${personId}`}))`);
  return getWalletMemberState(tx, personId);
}

/**
 * El mismo candado para quien llega con el correo y no con el `id` (el roster; ADR-120 regla 3):
 * resuelve a la persona y toma su consultivo en una sola sentencia, sin tocar todavía su fila.
 * Responde el `id` cuyo candado quedó tomado, o `null` si nadie tiene ese correo. El correo pudo
 * cambiar de dueño mientras se esperaba: quien llama vuelve a leer la fila con el candado tomado.
 */
export async function lockWalletMemberByEmail(tx: Tx, email: string): Promise<string | null> {
  const [row] = await tx
    .select({
      id: person.id,
      locked: sql`pg_advisory_xact_lock(hashtext(${LOCK_PREFIX}::text || ${person.id}))`,
    })
    .from(person)
    .where(eq(person.email, email));
  return row?.id ?? null;
}

/**
 * Corre `purge` solo si la baja de la persona sigue vigente (ADR-118 regla 5). El evento de una baja
 * dice cómo quedó la persona cuando se emitió, y el poller lo puede entregar o reintentar después de
 * que volvió: acá se toma el candado del ciclo de membresía, se lee el estado de ahora y `purge` borra
 * en esa misma transacción, a nombre del sistema. Un alta que llegue mientras tanto espera a que el
 * borrado confirme; una que ya confirmó deja a `purge` sin correr y la respuesta es `null`.
 *
 * Quien no tiene membresía no está adentro: a esa persona también se le borra.
 *
 * `purge` escribe con la transacción que recibe. Nada de lo que llame puede tomar este mismo candado
 * desde otra conexión, o se queda esperándose a sí mismo.
 */
export async function purgeIfMembershipEnded<Purged>(
  personId: string,
  purge: (ctx: CommandContext) => Promise<Purged>,
): Promise<Purged | null> {
  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    const state = await lockWalletMember(ctx.tx, personId);
    if (state && state.status !== "INACTIVE") {
      return null;
    }
    return purge(ctx);
  });
}
