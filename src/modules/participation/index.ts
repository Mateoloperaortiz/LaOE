// API pública del módulo participation.
export {
  conventionalTermDates,
  createTerm,
  findTermByCode,
  findTermContaining,
  getCurrentTerm,
  getTerm,
  listAllTerms,
  listTerms,
  semesterFromCode,
  TERM_CODE,
  type TermRow,
  updateTerm,
} from "./domain/terms";
