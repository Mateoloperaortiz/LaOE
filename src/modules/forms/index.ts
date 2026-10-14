// API pública del módulo forms (ADR-013, ADR-037).
export {
  createForm,
  type FormView,
  findOpenProspectForm,
  findOpenPublicFormForPipelines,
  findOpenRegistrationForm,
  getForm,
  getFormsByIds,
  getFormView,
  getPublicForm,
  listFormOptions,
  listSurveyFormOptions,
  recentSubmissionCounts,
  setFormActions,
  setFormActionsAs,
  setFormFields,
  setFormFieldsAs,
} from "./domain/forms";
export {
  answersFromFormData,
  FIELD_TYPES,
  type FormField,
  HONEYPOT_FIELD,
  parseFields,
  validateAnswers,
} from "./domain/pure";
export {
  countRegistrationsByEdition,
  isRegistered,
  listRegistrationsByPerson,
} from "./domain/registrations";
export {
  createSubmission,
  getSubmission,
  getSubmissionsByIds,
  listSubmissions,
  listSubmissionsByPerson,
  type SubmissionListRow,
  submitFormAs,
} from "./domain/submissions";
