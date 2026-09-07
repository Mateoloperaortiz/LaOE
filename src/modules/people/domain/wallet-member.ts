import { eq, sql } from "drizzle-orm";
import type { Executor, Tx } from "@/db/tx";
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

/**
 * Serializa el ciclo de membresía con la emisión y rotación de credenciales. Se adquiere antes de
 * cualquier lock de filas y solo dentro de transacciones cortas: nunca cubre llamadas a Google.
 */
export async function lockWalletMember(
  tx: Tx,
  personId: string,
): Promise<WalletMemberState | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wallet-member:${personId}`}))`);
  return getWalletMemberState(tx, personId);
}
