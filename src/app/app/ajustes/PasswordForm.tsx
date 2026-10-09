"use client";

import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { changePasswordAction, type PasswordState } from "./actions";

export interface PasswordLabels {
  title: string;
  currentLabel: string;
  passwordLabel: string;
  confirmationLabel: string;
  hint: string;
  submit: string;
}

type Props = {
  /** Quien todavía no tiene contraseña crea la primera con step-up, sin pedir la actual. */
  hasPassword: boolean;
  labels: PasswordLabels;
};

const inicial: PasswordState = { status: "idle" };

const campo =
  "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-tinta focus:border-titulo focus:outline-none";

export function PasswordForm({ hasPassword, labels }: Props) {
  const [state, action, pending] = useGuardedActionState(
    changePasswordAction,
    inicial,
    ({ message }) => ({ status: "error" as const, message }),
  );

  return (
    <form action={action} className="flex max-w-md flex-col gap-4" noValidate>
      <h3 className="text-titulo-lg">{labels.title}</h3>
      {hasPassword ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="current" className="eyebrow">
            {labels.currentLabel}
          </label>
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={campo}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className="eyebrow">
          {labels.passwordLabel}
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="new-password-hint"
          className={campo}
        />
        <p id="new-password-hint" className="text-sm text-tinta-suave">
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
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={state.status === "error" ? "password-error" : undefined}
          className={campo}
        />
      </div>
      {state.status === "error" ? (
        <p
          id="password-error"
          role="alert"
          className="rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <output className="block text-sm font-semibold text-titulo">{state.message}</output>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="boton-secundario self-start disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
