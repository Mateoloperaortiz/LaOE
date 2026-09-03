// API pública del módulo content: lo que otros módulos y src/app pueden usar.
export {
  createPage,
  findPublicPage,
  getPage,
  listPages,
  type PageRow,
  type PublicPage,
  updatePage,
} from "./domain/pages";
