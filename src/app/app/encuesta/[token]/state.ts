// Estado del formulario de la encuesta (un archivo "use server" solo exporta funciones).

export interface SurveyFormState {
  done: boolean;
  state: "OPEN" | "ANSWERED" | "EXPIRED" | "NOT_FOUND";
  errors: Record<string, string>;
  values: Record<string, unknown>;
  /** La acción no respondió (ADR-118 regla 20): lo arma el navegador, no la action. */
  message?: string;
}

export const initialSurveyState: SurveyFormState = {
  done: false,
  state: "OPEN",
  errors: {},
  values: {},
};
