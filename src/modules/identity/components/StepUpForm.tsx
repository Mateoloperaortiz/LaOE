"use client";

import { useActionState } from "react";
import { type StepUpState, stepUpAction } from "../actions";

type Props = {
  initialState: StepUpState;
  labels: { intro: string; request: string; codeTitle: string; codeLabel: string; verify: string };
};

// Step-up (ADR-010): un OTP nuevo antes de una acción sensible. Dos pasos, como el ingreso.
export function StepUpForm({ initialState, labels }: Props) {
  const [state, action, pending] = useActionState(stepUpAction, initialState);
  const inputClass =
    "rounded-xl border-2 border-borde bg-fondo px-4 py-3 text-lg text-tinta focus:border-titulo focus:outline-none";
  if (state.step === "request") {
    return (
      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="intent" value="request" />
        <input type="hidden" name="next" value={state.next} />
        <p className="text-lg">{labels.intro}</p>
        <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
          {labels.request}
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="next" value={state.next} />
      <h2 className="text-titulo-lg">{labels.codeTitle}</h2>
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
          <p
            id="stepup-error"
            role="alert"
            className="rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy"
          >
            {state.error}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className="boton-calido disabled:opacity-60">
        {labels.verify}
      </button>
    </form>
  );
}
