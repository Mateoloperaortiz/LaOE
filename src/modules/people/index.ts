// API pública del módulo people.
export {
  createCommittee,
  getCommittee,
  getPublishedCommittee,
  listAllCommittees,
  listCommittees,
  listPublishedCommittees,
  type PublicCommittee,
  searchCommittees,
  updateCommittee,
} from "./domain/committees";
export {
  findMemberByEmail,
  getPeopleByIds,
  type PersonRef,
  searchPeople,
} from "./domain/people-reads";
export {
  findEligibleMemberByEmail,
  getMemberSummary,
  type MemberSummary,
  type MembershipStatus,
  SIGN_IN_STATUSES,
} from "./domain/reads";
