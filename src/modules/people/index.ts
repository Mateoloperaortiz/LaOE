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
  revokeConsentAs,
  setCommitteeMembershipsAs,
  setPersonTagsAs,
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
  changeStatusSchema,
  endMembershipSchema,
  type MembershipEventView,
  reactivateSchema,
} from "./domain/membership";
export {
  findMemberByEmail,
  getPeopleByIds,
  type PersonRef,
  searchPeople,
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
