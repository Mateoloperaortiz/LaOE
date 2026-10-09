"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { t } from "@/shared/copy/client";

// Los formularios aguantan el rechazo de su acción (ADR-118 regla 20). Una acción de servidor rechaza
// cuando el pedido no llega (se cayó la red) o cuando el servidor lanza algo que no atrapó; con
// `useActionState` a secas React relanza ese rechazo al renderizar, la pantalla entera cae al error raíz
// y lo escrito se pierde. Acá el rechazo vuelve como un estado más del formulario, que sigue montado.
// Es la única puerta: `tests/unit/guarded-action.test.ts` falla si un componente llama `useActionState`
// sin manejar el rechazo.

type Action<State, Payload> = (previous: State, payload: Payload) => State | Promise<State>;

type ActionFailure<State, Payload> = {
  /** El estado que tenía el formulario al enviar. */
  previous: State;
  /** Lo que se envió: de acá sale lo escrito, para devolverlo a los campos que React reinicia. */
  payload: Payload;
  /** T-3252, listo para pintar. */
  message: string;
};

type OnRejected<State, Payload> = (failure: ActionFailure<State, Payload>) => State;

export function guardAction<State, Payload>(
  action: Action<State, Payload>,
  onRejected: OnRejected<State, Payload>,
  message: string,
): (previous: State, payload: Payload) => Promise<State> {
  return async (previous, payload) => {
    try {
      return await action(previous, payload);
    } catch (error) {
      // Las señales del framework (una redirección, un 404) no son un fallo: siguen su camino.
      unstable_rethrow(error);
      return onRejected({ previous, payload, message });
    }
  };
}

/** `useActionState` con el rechazo manejado: `onRejected` arma el estado que ve la persona. */
export function useGuardedActionState<State, Payload = FormData>(
  action: Action<State, Payload>,
  initialState: State,
  onRejected: OnRejected<State, Payload>,
): [state: State, dispatch: (payload: Payload) => void, pending: boolean] {
  const [state, dispatch, pending] = useActionState<State, Payload>(
    guardAction(action, onRejected, t("T-3252")) as (
      previous: Awaited<State>,
      payload: Payload,
    ) => Promise<State>,
    initialState as Awaited<State>,
  );
  return [state as State, dispatch, pending];
}

/** Un campo de texto de lo enviado, tal como se escribió; ausente o archivo cuenta como vacío. */
export function submittedText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
