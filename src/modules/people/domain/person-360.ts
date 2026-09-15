import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { listAllTerms } from "@/modules/terms";
import { committee, membership, membershipTerm, person } from "../schema";
import { type AppointmentView, listAppointments } from "./appointments";
import { listCommitteeMembershipsByTerm, type TermCommittees } from "./committee-memberships";
import { type ConsentState, listConsents } from "./consents";
import {
  listMembershipEvents,
  type MembershipEventView,
  type MembershipRecord,
} from "./membership";
import type { PersonRecord } from "./persons";
import {
  appointmentHistoryEntry,
  listCommitteeRoleHistory,
  type RoleHistoryEntry,
} from "./role-history";
import { listSanctionsForPerson, type SanctionView } from "./sanctions";

// Todo lo que la Persona 360 necesita de `people` en una sola lectura (02-crm.md).

export interface Person360 {
  person: PersonRecord;
  membership: (MembershipRecord & { firstTermCode: string; lastTermCode: string | null }) | null;
  events: MembershipEventView[];
  committeesByTerm: TermCommittees[];
  appointments: AppointmentView[];
  roleHistory: RoleHistoryEntry[];
  consents: ConsentState[];
  sanctions: SanctionView[];
  probation: Array<{
    termId: string;
    termCode: string;
    /** Comité al que aplica; nulo cuando aplica a todos (ADR-060 regla 2). */
    committeeId: string | null;
    committeeName: string | null;
    probation: boolean;
    reportAsVeteran: boolean;
    resumedNew: boolean;
    resumedTransfer: boolean;
    reason: string | null;
    academicVerifiedOn: string | null;
  }>;
}

export async function getPerson360(id: string): Promise<Person360 | null> {
  const db = getDb();
  const [who] = await db.select().from(person).where(eq(person.id, id)).limit(1);
  if (!who) {
    return null;
  }
  const [
    membershipRows,
    events,
    committeesByTerm,
    appointments,
    committeeRoles,
    consents,
    probationRows,
    terms,
    sanctions,
  ] = await Promise.all([
    db.select().from(membership).where(eq(membership.personId, id)).limit(1),
    listMembershipEvents(id),
    listCommitteeMembershipsByTerm(id),
    listAppointments(id),
    listCommitteeRoleHistory(id),
    listConsents(id),
    db
      .select({
        termId: membershipTerm.termId,
        committeeId: membershipTerm.committeeId,
        committeeName: committee.name,
        reason: membershipTerm.reason,
        probation: membershipTerm.probation,
        reportAsVeteran: membershipTerm.reportAsVeteran,
        resumedNew: membershipTerm.resumedNew,
        resumedTransfer: membershipTerm.resumedTransfer,
        academicVerifiedOn: membershipTerm.academicVerifiedOn,
      })
      .from(membershipTerm)
      .leftJoin(committee, eq(committee.id, membershipTerm.committeeId))
      .where(eq(membershipTerm.personId, id)),
    listAllTerms(),
    listSanctionsForPerson(id),
  ]);
  const termById = new Map(terms.map((term) => [term.id, term]));
  const first = membershipRows[0];
  const probation = probationRows
    .filter(
      (row) =>
        row.probation ||
        row.reportAsVeteran ||
        row.resumedNew ||
        row.resumedTransfer ||
        row.academicVerifiedOn !== null,
    )
    .map((row) => ({
      termId: row.termId,
      termCode: termById.get(row.termId)?.code ?? "",
      committeeId: row.committeeId,
      committeeName: row.committeeId ? (row.committeeName ?? "") : null,
      probation: row.probation,
      reportAsVeteran: row.reportAsVeteran,
      resumedNew: row.resumedNew,
      resumedTransfer: row.resumedTransfer,
      reason: row.reason,
      academicVerifiedOn: row.academicVerifiedOn,
      startsOn: termById.get(row.termId)?.startsOn ?? "",
    }))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map(({ startsOn: _startsOn, ...row }) => row);
  return {
    person: who,
    membership: first
      ? {
          ...first,
          firstTermCode: termById.get(first.firstTermId)?.code ?? "",
          lastTermCode: first.lastTermId ? (termById.get(first.lastTermId)?.code ?? null) : null,
        }
      : null,
    events,
    committeesByTerm,
    appointments,
    roleHistory: [...appointments.map(appointmentHistoryEntry), ...committeeRoles],
    consents,
    sanctions,
    probation,
  };
}
