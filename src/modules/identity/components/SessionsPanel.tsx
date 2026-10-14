"use client";

import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { type CloseOthersState, closeOtherSessionsAction } from "../actions";

type Props = {
  buttonLabel: string;
  doneMessage: string;
  disabled: boolean;
};

/** `failed` lo arma el navegador cuando la acción no respondió (ADR-118 regla 20). */
type PanelState = CloseOthersState & { failed?: string };

export function SessionsPanel({ buttonLabel, doneMessage, disabled }: Props) {
  const [state, action, pending] = useGuardedActionState<PanelState, FormData>(
    async () => closeOtherSessionsAction(),
    { done: false, closed: 0 },
    ({ previous, message }) => ({ ...previous, done: false, failed: message }),
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
      {state.failed ? (
        <p role="alert" className="text-sm font-semibold text-oe-orange">
          {state.failed}
        </p>
      ) : null}
    </form>
  );
}
