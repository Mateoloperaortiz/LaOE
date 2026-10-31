"use client";

import { ActionForm } from "@/shared/ui/ActionForm";

import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { type StepUpState, stepUpAction } from "../actions";

type Props = {
  initialState: StepUpState;
  labels: {
    intro: string;
    passwordLabel: string;
    confirm: string;
    useCode: string;
    codeIntro: string;
    codeLabel: string;
    verify: string;
    usePassword: string;
  };
};

const inputClass =
  "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-lg text-tinta focus:border-titulo focus:outline-none";
const errorClase = "rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy";

// Step-up (ADR-051): la contraseña del actor antes de una acción sensible; el código al correo
// queda como alternativa para cuando vuelva a llegar.
export function StepUpForm({ initialState, labels }: Props) {
  const [state, action, pending] = useGuardedActionState(
    stepUpAction,
    initialState,
    ({ previous, message }) => ({ ...previous, error: message }),
  );

  if (state.mode === "password") {
    return (
      <div className="flex flex-col gap-6">
        <ActionForm action={action} className="flex flex-col gap-5" noValidate>
          <input type="hidden" name="intent" value="verify-password" />
          <input type="hidden" name="next" value={state.next} />
          <p className="text-lg">{labels.intro}</p>
          <div className="flex flex-col gap-2">
            <label htmlFor="stepup-password" className="eyebrow">
              {labels.passwordLabel}
            </label>
            <input
              id="stepup-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "stepup-error" : undefined}
              className={inputClass}
            />
            {state.error ? (
              <p id="stepup-error" role="alert" className={errorClase}>
                {state.error}
              </p>
            ) : null}
          </div>
          <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
            {labels.confirm}
          </button>
        </ActionForm>
        <ActionForm action={action}>
          <input type="hidden" name="intent" value="use-code" />
          <input type="hidden" name="next" value={state.next} />
          <button type="submit" className="text-enlace text-sm underline underline-offset-4">
            {labels.useCode}
          </button>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ActionForm action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="intent" value="verify-code" />
        <input type="hidden" name="next" value={state.next} />
        <p className="text-lg">{labels.codeIntro}</p>
        <div className="flex flex-col gap-2">
          <label htmlFor="stepup-code" className="eyebrow">
            {labels.codeLabel}
          </label>
          <input
            id="stepup-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "stepup-error" : undefined}
            className={`${inputClass} font-display text-3xl tracking-[0.3em]`}
          />
          {state.error ? (
            <p id="stepup-error" role="alert" className={errorClase}>
              {state.error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
          {labels.verify}
        </button>
      </ActionForm>
      <ActionForm action={action}>
        <input type="hidden" name="intent" value="use-password" />
        <input type="hidden" name="next" value={state.next} />
        <button type="submit" className="text-enlace text-sm underline underline-offset-4">
          {labels.usePassword}
        </button>
      </ActionForm>
    </div>
  );
}
