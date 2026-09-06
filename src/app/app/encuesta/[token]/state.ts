// Estado del formulario de la encuesta (un archivo "use server" solo exporta funciones).

export interface SurveyFormState {
  done: boolean;
  state: "OPEN" | "ANSWERED" | "EXPIRED" | "NOT_FOUND";
  errors: Record<string, string>;
  values: Record<string, unknown>;
}

export const initialSurveyState: SurveyFormState = {
  done: false,
  state: "OPEN",
  errors: {},
  values: {},
};
