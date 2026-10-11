// API pública del módulo events: lo que otros módulos y src/app pueden usar.
export {
  createEdition,
  findNextPublicEdition,
  findNextPublicEditions,
  findUpcomingEditionsForMembers,
  getEdition,
  getPublishedEdition,
  listEditionOptions,
  listEditionRefs,
  listEditions,
  listEditionsByCommittee,
  listMemberEditionsForIcs,
  listPublicEditionsForIcs,
  listPublishedEditionsOf,
  type MemberEdition,
  type PublicEdition,
} from "./domain/editions";
export {
  getEvent,
  getPublishedEvent,
  listPublishedEvents,
  type PublicEvent,
} from "./domain/events";
export { buildIcs } from "./domain/ics-pure";
export { getEventRef, getMacroeventEdition, listMacroevents } from "./domain/macroevents";
export { isMacroeventSlug, macroeventRoleCodes } from "./domain/macroevents-pure";
