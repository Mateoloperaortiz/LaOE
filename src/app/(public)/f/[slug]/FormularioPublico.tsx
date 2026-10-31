"use client";

import { useId } from "react";
import type { FormField } from "@/modules/forms";
import { answersFromFormData } from "@/modules/forms/components/answers";
import { FormFields } from "@/modules/forms/components/FormFields";
import { ActionForm } from "@/shared/ui/ActionForm";
import { submittedText, useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { submitAction } from "./actions";
import { initialSubmitState, type SubmitState } from "./state";

// Formulario propio en el navegador: controles nativos, errores por campo y campo trampa oculto.
// Los textos llegan por props (src/shared no conoce módulos; este componente no llama a t()).

export interface FormularioPublicoProps {
  slug: string;
  fields: FormField[];
  isPublic: boolean;
  consentRequired: boolean;
  honeypotName: string;
  memberLine: string | null;
  labels: {
    firstName: string;
    lastName: string;
    email: string;
    requiredNote: string;
    consent: string;
    policyLink: string;
    submit: string;
    honeypot: string;
    multiHelp: string;
    dateHelp: string;
    required: string;
  };
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-base text-tinta focus:border-titulo focus:outline-none";

export function FormularioPublico(props: FormularioPublicoProps) {
  const [state, action, pending] = useGuardedActionState<SubmitState, FormData>(
    submitAction,
    initialSubmitState,
    ({ payload, message }) => ({
      errors: {},
      message,
      values: {
        firstName: submittedText(payload, "firstName"),
        lastName: submittedText(payload, "lastName"),
        email: submittedText(payload, "email"),
        ...answersFromFormData(payload, props.fields),
      },
    }),
  );
  const baseId = useId();
  const value = (key: string) => {
    const raw = state.values[key];
    return typeof raw === "string" ? raw : "";
  };
  return (
    <ActionForm action={action} className="flex max-w-2xl flex-col gap-6" noValidate>
      <input type="hidden" name="slug" value={props.slug} />
      {state.message ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-3 text-base font-semibold text-oe-navy"
        >
          {state.message}
        </p>
      ) : null}
      <p className="text-sm text-tinta-suave">{props.labels.requiredNote}</p>
      {props.isPublic ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {(
            [
              ["firstName", props.labels.firstName, "given-name", "text"],
              ["lastName", props.labels.lastName, "family-name", "text"],
              ["email", props.labels.email, "email", "email"],
            ] as const
          ).map(([name, label, autoComplete, type]) => {
            const id = `${baseId}-${name}`;
            const error = state.errors[name];
            return (
              <div
                key={name}
                className={
                  name === "email" ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"
                }
              >
                <label htmlFor={id} className="font-semibold">
                  {label}
                  <span aria-hidden="true"> *</span>
                </label>
                <input
                  id={id}
                  name={name}
                  type={type}
                  autoComplete={autoComplete}
                  defaultValue={value(name)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={inputClass}
                />
                {error ? (
                  <span
                    id={`${id}-error`}
                    role="alert"
                    className="text-sm font-semibold text-oe-orange"
                  >
                    {error}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : props.memberLine ? (
        <p className="text-base">{props.memberLine}</p>
      ) : null}
      {/* React reinicia el formulario al terminar la acción: la clave remonta los campos con lo escrito
          como valor por defecto (un <select> no vuelve a su opción si solo cambia defaultValue). */}
      <FormFields
        key={JSON.stringify(state.values)}
        fields={props.fields}
        values={state.values}
        errors={state.errors}
        labels={{
          required: props.labels.required,
          multiHelp: props.labels.multiHelp,
          dateHelp: props.labels.dateHelp,
        }}
        inputClass={inputClass}
      />
      {/* Campo trampa: fuera de la vista y del orden de tabulación; un humano no lo llena. */}
      <div
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor={`${baseId}-hp`}>{props.labels.honeypot}</label>
        <input
          id={`${baseId}-hp`}
          name={props.honeypotName}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      {props.isPublic && props.consentRequired ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${baseId}-consent`} className="flex items-start gap-3">
            <input
              id={`${baseId}-consent`}
              name="consent"
              type="checkbox"
              className="mt-1 size-5"
              aria-invalid={state.errors.consent ? true : undefined}
              aria-describedby={state.errors.consent ? `${baseId}-consent-error` : undefined}
            />
            <span>
              {props.labels.consent}{" "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">
                {props.labels.policyLink}
              </a>
            </span>
          </label>
          {state.errors.consent ? (
            <span
              id={`${baseId}-consent-error`}
              role="alert"
              className="text-sm font-semibold text-oe-orange"
            >
              {state.errors.consent}
            </span>
          ) : null}
        </div>
      ) : null}
      <button type="submit" className="boton-calido self-start" disabled={pending}>
        {props.labels.submit}
      </button>
    </ActionForm>
  );
}
