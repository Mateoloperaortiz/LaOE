// API pública del módulo people.

export { type AlumniEntry, type AlumniYear, listAlumniByYear } from "./domain/alumni";
export {
  APPOINTMENT_KINDS,
  type AppointmentKind,
  type AppointmentView,
  appointmentInputSchema,
} from "./domain/appointments";
export {
  addAppointmentAs,
  anonymizePersonAs,
  changeMembershipStatusAs,
  endMembershipAs,
  reactivateMembershipAs,
  recordConsentAs,
  removeAppointmentAs,
  requestDeletionAs,
  revokeConsentAs,
  setCommitteeMembershipsAs,
  setOwnPhotoAs,
  setPersonTagsAs,
  updateOwnContactAs,
  updatePersonAs,
} from "./domain/commands";
export {
  type CommitteeMembershipInput,
  type CommitteeMembershipView,
  type CommitteeRoleRow,
  committeeMembershipInputSchema,
  getMyMembership,
  listCommitteeRoles,
  type MyMembership as MyMembershipView,
  type TermCommittees,
} from "./domain/committee-memberships";
export {
  type CommitteeRef,
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
  changeStatusSchema,
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
  getMembershipRef,
  getPeopleByIds,
  listActiveMemberRefs,
  listAppointmentsForTerm,
  listMembershipStatuses,
  listTermCommitteeMembers,
  listTermRoster,
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
export { normalizePhone, splitFullName } from "./domain/person-pure";
export {
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
  findPeopleByFilter,
  type SegmentFilter,
  type SegmentRow,
  segmentFilterSchema,
} from "./domain/segments";
export { listAllTags, listPersonTags, type TagRow } from "./domain/tags";
