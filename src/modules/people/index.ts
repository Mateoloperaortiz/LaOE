// API pública del módulo people.

export { canParticipate } from "./domain/access-pure";
export {
  type AdmitInput,
  admitInputSchema,
  admitPerson,
  isInstitutionalEmail,
} from "./domain/admission";
export { listAlumniByYear } from "./domain/alumni";
export {
  APPOINTMENT_KINDS,
  type AppointmentLabelInput,
  appointmentInputSchema,
  appointmentLabel,
  BOARD_APPOINTMENT_KINDS,
  isMacroeventDirector,
  listDirectedEditionIds,
  listMacroeventBoard,
  listMacroeventRoles,
  MACROEVENT_ROLE_CODES,
  requireEditionTerm,
} from "./domain/appointments";
export { assertBenefitsAvailable } from "./domain/benefits";
export {
  areasFor,
  COMMITTEE_AREA_KEYS,
  COMMITTEE_CAPABILITIES,
  type CommitteeArea,
  type CommitteeCapability,
} from "./domain/capabilities";
export {
  addAppointmentAs,
  addCommitteeMemberAs,
  addMacroeventDirectorAs,
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
  type EligibleMember,
  listCommitteesMissingRequiredRoles,
  listMyCommitteeCapabilities,
  type RosterActorContext,
  removalRequestSchema,
  rosterChangeSchema,
  searchEligibleMembers,
} from "./domain/committee-direction";
export { committeeRolesLabel, type RoleView } from "./domain/committee-direction-pure";
export {
  type CommitteeMembershipInput,
  type CommitteeRoleRow,
  committeeMembershipInputSchema,
  getMyMembership,
  getMyMembershipForUpdate,
  listCommitteeRoles,
  type MyMembership as MyMembershipView,
  setCommitteeMemberships,
} from "./domain/committee-memberships";
export {
  type CommitteeRef,
  committeeProfileSchema,
  createCommittee,
  getPublishedCommittee,
  listAllCommittees,
  listCommitteesByIds,
  listCommitteesForSelection,
  listLiveCommitteeIds,
  listPublishedCommittees,
  searchCommittees,
} from "./domain/committees";
export {
  CONSENT_PURPOSES,
  hasLiveConsent,
  listConsents,
  listLiveConsentHolders,
  recordConsent,
  SELF_MANAGED_PURPOSES,
} from "./domain/consents";
export {
  type InternalCommittee,
  type InternalRoster,
  isInInternalRoster,
  listDirectory,
  listInternalCommittees,
  listInternalRoster,
  type RosterMember,
} from "./domain/directory";
export { honoraryFacts } from "./domain/honorary";
export {
  type HonoraryEligibility,
  honoraryEligibility,
} from "./domain/honorary-pure";
export { leaveUntilError, leaveWindow } from "./domain/leave-pure";
export {
  changeMembershipStatus,
  changeStatusSchema,
  endMembership,
  endMembershipSchema,
  listExpiredLeaves,
  reactivateSchema,
} from "./domain/membership";
export {
  collectPersonalData,
  ownContactSchema,
} from "./domain/own-data";
export {
  type ActiveMemberRef,
  findMemberByEmail,
  findMembersByEmails,
  findPersonByEmail,
  getMembershipRef,
  getPeopleByIds,
  getPresenceMembershipHistory,
  listActiveMemberRefs,
  listAppointmentsForTerm,
  listCommitteeIdsForPersonInTerm,
  listMailingRefs,
  listMemberRefsByStatus,
  listMembershipPersonIds,
  listMembershipStatuses,
  listSignInMemberIds,
  listTermCommitteeMembers,
  listTermRoster,
  searchMembersByName,
  searchPeople,
  type TermRosterRow,
} from "./domain/people-reads";
export { getPerson360, type Person360 } from "./domain/person-360";
export {
  DOCUMENT_TYPE_CODES,
  formatBirthDate,
  normalizePhone,
} from "./domain/person-pure";
export {
  createPerson,
  findOrCreatePersonFromForm,
  getPersonRecord,
  lockPersonAnonymization,
  personInputSchema,
} from "./domain/persons";
export {
  findEligibleMemberByEmail,
  getMemberSummary,
  type MembershipStatus,
  SIGN_IN_STATUSES,
} from "./domain/reads";
export {
  listLiveDirectionForTerm,
  listRepresentatives,
  type RepresentativeView,
} from "./domain/representatives";
export {
  groupRoleHistory,
  partitionRoleHistory,
  type RoleHistoryEntry,
} from "./domain/role-history";
export {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
  type PreviewRow,
  type RosterPreview,
  recordLeaderGrantsAs,
  remapRosterPreviewAs,
  rosterColumnCountSchema,
} from "./domain/roster";
export { ROSTER_MAX_BYTES } from "./domain/roster-file";
export { HEADER_ALIASES, ROSTER_COLUMNS, type RosterColumn } from "./domain/roster-pure";
export {
  COMMITTEE_SANCTION_KINDS,
  SANCTION_KINDS,
  type SanctionScope,
} from "./domain/sanction-pure";
export {
  listExpulsionWarnings,
  listSanctionsForPerson,
  type SanctionView,
  sanctionInputSchema,
  sanctionStateFor,
} from "./domain/sanctions";
export {
  findPeopleByFilter,
  getSegment,
  listAllSegments,
} from "./domain/segments";
export { markApplicant } from "./domain/stage";
export { addPersonTags, listAllTags, listPersonTags, type TagRow } from "./domain/tags";
export { probationInputSchema } from "./domain/term-outcomes";
export {
  getWalletMemberState,
  lockMembershipCycle,
  lockMembershipCycles,
  purgeIfMembershipEnded,
  type WalletMemberState,
} from "./domain/wallet-member";
