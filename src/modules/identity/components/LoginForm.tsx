"use client";

import { ActionForm } from "@/shared/ui/ActionForm";

import { submittedText, useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { type LoginState, loginAction } from "../actions";

export interface LoginLabels {
  emailLabel: string;
  passwordLabel: string;
  rememberLabel: string;
  submitButton: string;
}

type Props = {
  initialState: LoginState;
  labels: LoginLabels;
};

const campo =
  "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-lg text-tinta focus:border-titulo focus:outline-none";
const errorClase = "rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy";

// Ingreso con la contraseña propia (ADR-051). Un solo paso; los textos llegan del servidor.
export function LoginForm({ initialState, labels }: Props) {
  const [state, action, pending] = useGuardedActionState(
    loginAction,
    initialState,
    ({ previous, payload, message }) => ({
      ...previous,
      email: submittedText(payload, "email"),
      error: message,
      fieldError: null,
    }),
  );

  return (
    <ActionForm action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={state.next} />
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="eyebrow">
          {labels.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? "email-error" : undefined}
          className={campo}
        />
        {state.fieldError ? (
          <p id="email-error" role="alert" className={errorClase}>
            {state.fieldError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="eyebrow">
          {labels.passwordLabel}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
          className={campo}
        />
        {state.error ? (
          <p id="password-error" role="alert" className={errorClase}>
            {state.error}
          </p>
        ) : null}
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="remember" className="size-5 accent-oe-navy" />
        <span>{labels.rememberLabel}</span>
      </label>
      <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
        {labels.submitButton}
      </button>
    </ActionForm>
  );
}
