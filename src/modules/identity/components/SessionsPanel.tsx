"use client";

import { useActionState } from "react";
import { type CloseOthersState, closeOtherSessionsAction } from "../actions";

type Props = {
  buttonLabel: string;
  doneMessage: string;
  disabled: boolean;
};

export function SessionsPanel({ buttonLabel, doneMessage, disabled }: Props) {
  const [state, action, pending] = useActionState(
    async (): Promise<CloseOthersState> => closeOtherSessionsAction(),
    { done: false, closed: 0 },
  );
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <button
        type="submit"
        disabled={disabled || pending}
        className="boton-secundario disabled:opacity-50"
      >
        {buttonLabel}
      </button>
      {state.done ? (
        <output className="block text-sm font-semibold text-titulo">{doneMessage}</output>
      ) : null}
    </form>
  );
}
