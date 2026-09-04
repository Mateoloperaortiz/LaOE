// API pública del módulo terms (el término como reloj universal, ADR-004; módulo propio sin dependencias, ADR-035).
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
