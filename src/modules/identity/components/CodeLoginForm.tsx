"use client";

import { submittedText, useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { type CodeLoginState, codeLoginAction } from "../actions";

export interface CodeLoginLabels {
  emailLabel: string;
  requestButton: string;
  codeTitle: string;
  codeLabel: string;
  rememberLabel: string;
  verifyButton: string;
  restartButton: string;
}

type Props = {
  initialState: CodeLoginState;
  labels: CodeLoginLabels;
};

const campo =
  "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-lg text-tinta focus:border-titulo focus:outline-none";
const errorClase = "rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy";

// Método alterno en dos pasos (ADR-051): correo → código. Los textos llegan del servidor.
export function CodeLoginForm({ initialState, labels }: Props) {
  const [state, action, pending] = useGuardedActionState(
    codeLoginAction,
    initialState,
    ({ previous, payload, message }) =>
      previous.step === "email"
        ? { ...previous, email: submittedText(payload, "email"), fieldError: message }
        : { ...previous, error: message },
  );

  if (state.step === "email") {
    return (
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="intent" value="request" />
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
            autoComplete="email"
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
        <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
          {labels.requestButton}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {state.message ? (
        <output className="block rounded-xl border border-borde bg-fondo-suave px-4 py-3 text-tinta">
          {state.message}
        </output>
      ) : null}
      <form action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="next" value={state.next} />
        <input type="hidden" name="email" value={state.email} />
        <h2 className="text-titulo-lg">{labels.codeTitle}</h2>
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="eyebrow">
            {labels.codeLabel}
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "code-error" : undefined}
            className={`${campo} font-display text-3xl tracking-[0.3em]`}
          />
          {state.error ? (
            <p id="code-error" role="alert" className={errorClase}>
              {state.error}
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="remember" className="size-5 accent-oe-navy" />
          <span>{labels.rememberLabel}</span>
        </label>
        <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
          {labels.verifyButton}
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name="intent" value="restart" />
        <input type="hidden" name="next" value={state.next} />
        <button type="submit" className="text-enlace underline underline-offset-4">
          {labels.restartButton}
        </button>
      </form>
    </div>
  );
}
