// Estado del envío de un formulario propio: errores por campo, mensaje general y lo escrito.
export interface SubmitState {
  errors: Record<string, string>;
  message: string | null;
  values: Record<string, unknown>;
}

export const initialSubmitState: SubmitState = { errors: {}, message: null, values: {} };
