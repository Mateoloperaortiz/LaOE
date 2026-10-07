import { type Actor, runCommand } from "@/db/tx";
import { type AdmitInput, admitPerson } from "./admission";
import {
  type AppointmentInput,
  addAppointment,
  addMacroeventDirector,
  type MacroeventDirectorInput,
  removeAppointment,
} from "./appointments";
import {
  addCommitteeMember,
  type RemovalRequestInput,
  type RosterActorContext,
  type RosterChangeInput,
  type RosterScope,
  requestCommitteeRemoval,
  setMemberRoles,
} from "./committee-direction";
import { type CommitteeMembershipInput, setCommitteeMemberships } from "./committee-memberships";
import { type CommitteeProfileInput, updateCommitteeProfile } from "./committees";
import { type ConsentPurpose, type ConsentSource, recordConsent, revokeConsent } from "./consents";
import type { Override } from "./inhabilities";
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
import { createPerson, type PersonInput, updatePerson } from "./persons";
import { type RepresentativeInput, setRepresentative } from "./representatives";
import type { SanctionScope } from "./sanction-pure";
import { recordSanction, revokeSanction, type SanctionInput } from "./sanctions";
import { setPersonTags } from "./tags";
import { leaveCommittee, type ProbationInput, setProbation } from "./term-outcomes";

// Los comandos abren su transacción aquí, para que las acciones de página (src/app) los usen sin
// tocar src/db: cada uno es `runCommand` con auditoría y eventos en la misma transacción (ADR-012).

export function createPersonAs(actor: Actor, input: PersonInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createPerson(ctx, input));
}

export function updatePersonAs(actor: Actor, id: string, input: PersonInput): Promise<void> {
  return runCommand(actor, (ctx) => updatePerson(ctx, id, input));
}

export function admitPersonAs(
  actor: Actor,
  personId: string,
  input: AdmitInput,
): Promise<{ membershipId: string }> {
  return runCommand(actor, (ctx) => admitPerson(ctx, personId, input));
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
  override?: Override,
): Promise<void> {
  return runCommand(actor, (ctx) =>
    setCommitteeMemberships(ctx, personId, termId, rows, new Date(), override),
  );
}

export function addAppointmentAs(
  actor: Actor,
  personId: string,
  input: AppointmentInput,
  override?: Override,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addAppointment(ctx, personId, input, override));
}

export function removeAppointmentAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => removeAppointment(ctx, id));
}

export function addMacroeventDirectorAs(
  actor: Actor,
  input: MacroeventDirectorInput,
  override?: Override,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addMacroeventDirector(ctx, input, override));
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

// La dirección del comité (ADR-058): comandos con eje comité; `who` dice si el actor es ADMIN o
// líder técnico, porque `people` no conoce `Permission`.

export function addCommitteeMemberAs(
  actor: Actor,
  scope: RosterScope,
  who: RosterActorContext,
  input: RosterChangeInput,
): Promise<{ membershipId: string; revived: boolean }> {
  return runCommand(actor, (ctx) => addCommitteeMember(ctx, scope, who, input));
}

export function setMemberRolesAs(
  actor: Actor,
  scope: RosterScope,
  who: RosterActorContext,
  input: RosterChangeInput,
): Promise<{ changed: boolean }> {
  return runCommand(actor, (ctx) => setMemberRoles(ctx, scope, who, input));
}

export function updateCommitteeProfileAs(
  actor: Actor,
  committeeId: string,
  input: CommitteeProfileInput,
): Promise<void> {
  return runCommand(actor, (ctx) => updateCommitteeProfile(ctx, committeeId, input));
}

export function requestCommitteeRemovalAs(
  actor: Actor,
  scope: RosterScope,
  who: RosterActorContext,
  input: RemovalRequestInput,
): Promise<void> {
  return runCommand(actor, (ctx) => requestCommitteeRemoval(ctx, scope, who, input));
}

// Faltas y sanciones (ADR-060 regla 6). `scope` dice desde dónde se sanciona y es obligatorio, también
// para ADMIN (ADR-072 regla 1; ADR-112): la dirección de un comité o ADMIN desde la Persona 360.

export function recordSanctionAs(
  actor: Actor,
  personId: string,
  input: SanctionInput,
  scope: SanctionScope,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => recordSanction(ctx, personId, input, scope));
}

export function revokeSanctionAs(actor: Actor, sanctionId: string, reason: string): Promise<void> {
  return runCommand(actor, (ctx) => revokeSanction(ctx, sanctionId, reason));
}

// Representación ante la Asamblea Directiva (ADR-060 regla 7).

export function setRepresentativeAs(actor: Actor, input: RepresentativeInput): Promise<void> {
  return runCommand(actor, (ctx) => setRepresentative(ctx, input));
}
