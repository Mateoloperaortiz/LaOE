// Un archivo "use server" solo puede exportar funciones, así que el estado del formulario vive acá.
export interface ActivateState {
  error: string | null;
}

export const initialActivateState: ActivateState = { error: null };
