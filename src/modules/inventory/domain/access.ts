import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Actor, Executor, Tx } from "@/db/tx";
import {
  canParticipate,
  getMembershipRef,
  hasCurrentVpAdmin,
  hasVpAdminInTerm,
  listLogisticsSources,
  lockMembershipCycles,
} from "@/modules/people";
import { hasCmlMembershipInTerm } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventoryGrant } from "../schema";
import type { InventoryContext } from "./types";

export async function getInventoryContext(
  personId: string,
  exec: Executor = getDb(),
): Promise<InventoryContext> {
  const member = await getMembershipRef(personId, exec);
  const current = await getCurrentTerm(new Date(), exec);
  const operational = canParticipate(member?.status);
  const canManage =
    operational && current !== null && (await hasVpAdminInTerm(personId, current.id, exec));
  const isCml =
    operational && current !== null && (await hasCmlMembershipInTerm(personId, current.id, exec));
  const sources = operational
    ? await listLogisticsSources(canManage ? undefined : personId, exec)
    : [];
  const grants = await exec.select().from(inventoryGrant).where(isNull(inventoryGrant.revokedAt));
  const result = sources.map((source) => ({
    ...source,
    granted: grants.some(
      (grant) =>
        grant.sourceKind === source.kind &&
        grant.sourceId === source.id &&
        grant.personId === source.personId,
    ),
  }));
  return {
    canManage,
    canOperate: canManage || isCml,
    isCml,
    canReserve: result.some((source) => source.personId === personId && source.granted),
    termId: current?.id ?? null,
    sources: result,
  };
}

export async function lockActors(tx: Tx, actor: Actor, ids: string[] = []): Promise<string> {
  if (!actor.personId) throw new DomainError(t("T-4200"));
  await lockMembershipCycles(tx, [actor.personId, ...ids]);
  const member = await getMembershipRef(actor.personId, tx);
  if (!canParticipate(member?.status)) throw new DomainError(t("T-4200"));
  return actor.personId;
}

export async function assertManager(personId: string, exec: Executor): Promise<void> {
  if (!(await hasCurrentVpAdmin(personId, exec))) throw new DomainError(t("T-4200"));
}

export async function assertOperator(personId: string, exec: Executor): Promise<void> {
  const access = await getInventoryContext(personId, exec);
  if (!access.canOperate) throw new DomainError(t("T-4200"));
}

export async function hasReservationGrant(
  personId: string,
  sourceKind: string,
  sourceId: string,
  exec: Executor,
): Promise<boolean> {
  const [grant] = await exec
    .select({ id: inventoryGrant.id })
    .from(inventoryGrant)
    .where(
      and(
        eq(inventoryGrant.personId, personId),
        eq(inventoryGrant.sourceKind, sourceKind),
        eq(inventoryGrant.sourceId, sourceId),
        isNull(inventoryGrant.revokedAt),
      ),
    );
  return grant !== undefined;
}
