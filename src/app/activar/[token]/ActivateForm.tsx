"use client";

import { ActionForm } from "@/shared/ui/ActionForm";

import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { activateAction } from "./actions";
import { initialActivateState } from "./state";

export interface ActivateLabels {
  passwordLabel: string;
  confirmationLabel: string;
  hint: string;
  submit: string;
}

type Props = {
  token: string;
  labels: ActivateLabels;
};

const campo =
  "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-lg text-tinta focus:border-titulo focus:outline-none";

export function ActivateForm({ token, labels }: Props) {
  const [state, action, pending] = useGuardedActionState(
    activateAction,
    initialActivateState,
    ({ previous, message }) => ({ ...previous, error: message }),
  );

  return (
    <ActionForm action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="eyebrow">
          {labels.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-hint"
          aria-invalid={state.error ? true : undefined}
          className={campo}
        />
        <p id="password-hint" className="text-sm text-tinta-suave">
          {labels.hint}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="confirmation" className="eyebrow">
          {labels.confirmationLabel}
        </label>
        <input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "activar-error" : undefined}
          className={campo}
        />
      </div>
      {state.error ? (
        <p
          id="activar-error"
          role="alert"
          className="rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy"
        >
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
        {labels.submit}
      </button>
    </ActionForm>
  );
}
