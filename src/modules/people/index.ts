// API pública del módulo people.

export { canParticipate } from "./domain/access-pure";
export {
  type AdmitInput,
  admitInputSchema,
  admitPerson,
  isInstitutionalEmail,
} from "./domain/admission";
export { type AlumniEntry, type AlumniYear, listAlumniByYear } from "./domain/alumni";
export {
  APPOINTMENT_KINDS,
  type AppointmentKind,
  type AppointmentView,
  appointmentInputSchema,
} from "./domain/appointments";
export {
  areasFor,
  COMMITTEE_AREAS,
  COMMITTEE_CAPABILITIES,
  type CommitteeArea,
  type CommitteeCapability,
  hasCapability,
} from "./domain/capabilities";
export {
  addAppointmentAs,
  addCommitteeMemberAs,
  admitPersonAs,
  anonymizePersonAs,
  changeMembershipStatusAs,
  createPersonAs,
  endMembershipAs,
  leaveCommitteeAs,
  reactivateMembershipAs,
  recordConsentAs,
  recordSanctionAs,
  removeAppointmentAs,
  requestCommitteeRemovalAs,
  requestDeletionAs,
  revokeConsentAs,
  revokeSanctionAs,
  setCommitteeMembershipsAs,
  setMemberRolesAs,
  setOwnPhotoAs,
  setPersonTagsAs,
  setProbationAs,
  setRepresentativeAs,
  updateCommitteeProfileAs,
  updateOwnContactAs,
  updatePersonAs,
} from "./domain/commands";
export {
  type DirectedCommittee,
  type EligibleMember,
  listCommitteesMissingRequiredRoles,
  listMyCommitteeCapabilities,
  type MissingRequiredRoles,
  type RemovalRequestInput,
  type RosterActorContext,
  type RosterChangeInput,
  type RosterScope,
  removalRequestSchema,
  rosterChangeSchema,
  searchEligibleMembers,
} from "./domain/committee-direction";
export { committeeRolesLabel, type RoleView } from "./domain/committee-direction-pure";
export {
  type CommitteeMembershipInput,
  type CommitteeMembershipView,
  type CommitteeRoleRow,
  committeeMembershipInputSchema,
  getMyMembership,
  listCommitteeRoles,
  type MyMembership as MyMembershipView,
  setCommitteeMemberships,
  type TermCommittees,
} from "./domain/committee-memberships";
export {
  type CommitteeProfileInput,
  type CommitteeRef,
  committeeProfileSchema,
  createCommittee,
  getCommittee,
  getPublishedCommittee,
  listAllCommittees,
  listCommittees,
  listCommitteesByIds,
  listPublishedCommittees,
  type PublicCommittee,
  searchCommittees,
  updateCommittee,
} from "./domain/committees";
export {
  CONSENT_PURPOSES,
  type ConsentPurpose,
  type ConsentState,
  hasLiveConsent,
  listConsents,
  listLiveConsentHolders,
  recordConsent,
  SELF_MANAGED_PURPOSES,
} from "./domain/consents";
export {
  type DirectoryEntry,
  type DirectoryPage,
  type InternalCommittee,
  type InternalRoster,
  listDirectory,
  listInternalCommittees,
  listInternalRoster,
  type RosterMember,
} from "./domain/directory";
export {
  type ChangeStatusInput,
  changeMembershipStatus,
  changeStatusSchema,
  type EndMembershipInput,
  endMembership,
  endMembershipSchema,
  type MembershipEventView,
  reactivateSchema,
} from "./domain/membership";
export {
  collectPersonalData,
  type OwnContactInput,
  ownContactSchema,
  type PersonalData,
} from "./domain/own-data";
export {
  type ActiveMemberRef,
  findMemberByEmail,
  findMembersByEmails,
  findPersonByEmail,
  getMembershipRef,
  getPeopleByIds,
  listActiveMemberRefs,
  listAppointmentsForTerm,
  listMailingRefs,
  listMembershipStatuses,
  listSignInMemberIds,
  listTermCommitteeMembers,
  listTermRoster,
  type MailingRef,
  type MemberByEmail,
  type MemberRef,
  type MembershipRef,
  type MembershipStatusRef,
  type PersonRef,
  searchMembersByName,
  searchPeople,
  type TermAppointment,
  type TermCommitteeMember,
  type TermRosterRow,
} from "./domain/people-reads";
export { getPerson360, type Person360 } from "./domain/person-360";
export {
  DOCUMENT_TYPE_CODES,
  formatBirthDate,
  normalizePhone,
  splitFullName,
} from "./domain/person-pure";
export {
  createPerson,
  type FormPersonInput,
  findOrCreatePersonFromForm,
  formPersonSchema,
  getPersonRecord,
  listPeople,
  type PersonInput,
  type PersonRecord,
  type PersonRow,
  personInputSchema,
} from "./domain/persons";
export {
  findEligibleMemberByEmail,
  getMemberSummary,
  type MemberSummary,
  type MembershipStatus,
  SIGN_IN_STATUSES,
} from "./domain/reads";
export {
  type DirectionRef,
  listLiveDirectionForTerm,
  listRepresentatives,
  REPRESENTATIVE_ROLES,
  type RepresentativeInput,
  type RepresentativeRole,
  type RepresentativeView,
  representativeInputSchema,
  representativeRoleLabel,
} from "./domain/representatives";
export {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
  type LeaderProposal,
  type PreviewRow,
  type RosterPreview,
  recordLeaderGrantsAs,
  remapRosterPreviewAs,
} from "./domain/roster";
export { ROSTER_MAX_BYTES } from "./domain/roster-file";
export { HEADER_ALIASES, ROSTER_COLUMNS, type RosterColumn } from "./domain/roster-pure";
export {
  addDays as addDaysToKey,
  dayKeyOf,
  expulsionWarning,
  SANCTION_KINDS,
  type SanctionKind,
  type SanctionLike,
  type SanctionState,
} from "./domain/sanction-pure";
export {
  listExpulsionWarnings,
  listSanctionsForPerson,
  type SanctionInput,
  type SanctionStateView,
  type SanctionView,
  sanctionInputSchema,
  sanctionKindLabel,
  sanctionStateFor,
} from "./domain/sanctions";
export {
  findPeopleByFilter,
  getSegment,
  listAllSegments,
  type SegmentFilter,
  type SegmentRow,
  segmentFilterSchema,
} from "./domain/segments";
export { markApplicant } from "./domain/stage";
export { addPersonTags, listAllTags, listPersonTags, type TagRow } from "./domain/tags";
export { probationInputSchema } from "./domain/term-outcomes";
export {
  getWalletMemberState,
  lockWalletMember,
  type WalletMemberState,
} from "./domain/wallet-member";
