import { type Actor, runCommand } from "@/db/tx";
import { type AppointmentInput, addAppointment, removeAppointment } from "./appointments";
import { type CommitteeMembershipInput, setCommitteeMemberships } from "./committee-memberships";
import { type ConsentPurpose, type ConsentSource, recordConsent, revokeConsent } from "./consents";
import {
  anonymizePerson,
  type ChangeStatusInput,
  changeMembershipStatus,
  type EndMembershipInput,
  endMembership,
  type ReactivateInput,
  reactivateMembership,
} from "./membership";
import { type OwnContactInput, requestDeletion, setOwnPhoto, updateOwnContact } from "./own-data";
import { type PersonInput, updatePerson } from "./persons";
import { setPersonTags } from "./tags";
import { leaveCommittee, type ProbationInput, setProbation } from "./term-outcomes";

// Los comandos abren su transacción aquí, para que las acciones de página (src/app) los usen sin
// tocar src/db: cada uno es `runCommand` con auditoría y eventos en la misma transacción (ADR-012).

export function updatePersonAs(actor: Actor, id: string, input: PersonInput): Promise<void> {
  return runCommand(actor, (ctx) => updatePerson(ctx, id, input));
}

export function changeMembershipStatusAs(
  actor: Actor,
  personId: string,
  input: ChangeStatusInput,
): Promise<void> {
  return runCommand(actor, (ctx) => changeMembershipStatus(ctx, personId, input));
}

export function endMembershipAs(
  actor: Actor,
  personId: string,
  input: EndMembershipInput,
): Promise<boolean> {
  return runCommand(actor, (ctx) => endMembership(ctx, personId, input));
}

export function reactivateMembershipAs(
  actor: Actor,
  personId: string,
  input: ReactivateInput,
): Promise<void> {
  return runCommand(actor, (ctx) => reactivateMembership(ctx, personId, input));
}

export function anonymizePersonAs(actor: Actor, personId: string): Promise<void> {
  return runCommand(actor, (ctx) => anonymizePerson(ctx, personId));
}

export function setCommitteeMembershipsAs(
  actor: Actor,
  personId: string,
  termId: string,
  rows: CommitteeMembershipInput[],
): Promise<void> {
  return runCommand(actor, (ctx) => setCommitteeMemberships(ctx, personId, termId, rows));
}

export function addAppointmentAs(
  actor: Actor,
  personId: string,
  input: AppointmentInput,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addAppointment(ctx, personId, input));
}

export function removeAppointmentAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => removeAppointment(ctx, id));
}

export function recordConsentAs(
  actor: Actor,
  personId: string,
  purpose: ConsentPurpose,
  source: ConsentSource,
): Promise<{ id: string; created: boolean }> {
  return runCommand(actor, (ctx) => recordConsent(ctx, personId, { purpose, source }));
}

export function revokeConsentAs(
  actor: Actor,
  personId: string,
  purpose: ConsentPurpose,
): Promise<boolean> {
  return runCommand(actor, (ctx) => revokeConsent(ctx, personId, purpose));
}

export function updateOwnContactAs(
  actor: Actor & { personId: string },
  input: OwnContactInput,
): Promise<void> {
  return runCommand(actor, (ctx) => updateOwnContact(ctx, actor.personId, input));
}

export function setOwnPhotoAs(
  actor: Actor & { personId: string },
  assetId: string | null,
): Promise<void> {
  return runCommand(actor, (ctx) => setOwnPhoto(ctx, actor.personId, assetId));
}

export function requestDeletionAs(
  actor: Actor & { personId: string },
): Promise<{ created: boolean; requestedAt: Date }> {
  return runCommand(actor, (ctx) => requestDeletion(ctx, actor.personId));
}

export function setPersonTagsAs(actor: Actor, personId: string, tagIds: string[]): Promise<void> {
  return runCommand(actor, (ctx) => setPersonTags(ctx, personId, tagIds));
}

export function setProbationAs(
  actor: Actor,
  personId: string,
  termId: string,
  input: ProbationInput,
): Promise<void> {
  return runCommand(actor, (ctx) => setProbation(ctx, personId, termId, input));
}

export function leaveCommitteeAs(
  actor: Actor,
  personId: string,
  committeeId: string,
  termId: string,
  reason: string,
): Promise<void> {
  return runCommand(actor, (ctx) => leaveCommittee(ctx, personId, committeeId, termId, reason));
}
