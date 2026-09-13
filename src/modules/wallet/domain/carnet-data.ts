import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { getCarnetCredential } from "@/modules/identity";
import {
  committeeRolesLabel,
  getMembershipRef,
  getMyMembership,
  getPersonRecord,
  getWalletMemberState,
} from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import type { CarnetData } from "./pass-pure";

/** Solo lee: ni un refresco ni una visita al carnet crean credenciales o pases. */
export async function loadCarnetData(
  personId: string,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<CarnetData> {
  const state = await getWalletMemberState(exec, personId);
  const credential = await getCarnetCredential(personId, exec);
  if (
    !state ||
    state.anonymizedAt ||
    state.status === "INACTIVE" ||
    !credential ||
    credential.walletEpoch !== state.walletEpoch
  ) {
    throw new DomainError(t("T-1207"));
  }
  const who = await getPersonRecord(personId, exec);
  const member = await getMembershipRef(personId, exec);
  const mine = await getMyMembership(personId, exec, now);
  if (!who || !member) {
    throw new DomainError(t("T-032"));
  }
  const first = await getTerm(member.firstTermId, exec);
  return {
    personId,
    fullName: who.fullName?.trim() || [who.firstName, who.lastName].filter(Boolean).join(" "),
    committees: mine.committees.map((item) => ({
      name: item.committeeName,
      role: committeeRolesLabel(item.roles, item.roleLabel),
    })),
    term: mine.term ? { id: mine.term.id, code: mine.term.code } : null,
    firstTermCode: first?.code ?? null,
    token: credential.token,
    walletEpoch: credential.walletEpoch,
    revision: credential.revision,
  };
}
