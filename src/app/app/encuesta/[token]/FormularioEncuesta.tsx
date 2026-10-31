"use client";

import type { FormField } from "@/modules/forms";
import { answersFromFormData } from "@/modules/forms/components/answers";
import { FormFields } from "@/modules/forms/components/FormFields";
import { ActionForm } from "@/shared/ui/ActionForm";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { answerSurveyAction } from "./actions";
import { initialSurveyState, type SurveyFormState } from "./state";

// La encuesta en el navegador (ADR-038 regla 13): controles nativos y errores por campo; los textos
// llegan por props. Al terminar muestra el gracias; si la invitación cambió de estado, lo dice.

export interface FormularioEncuestaProps {
  token: string;
  fields: FormField[];
  labels: {
    submit: string;
    required: string;
    multiHelp: string;
    dateHelp: string;
    rating: [string, string];
    thanks: string;
    answered: string;
    expired: string;
    notFound: string;
  };
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-base text-tinta focus:border-titulo focus:outline-none";

export function FormularioEncuesta(props: FormularioEncuestaProps) {
  const [state, action, pending] = useGuardedActionState<SurveyFormState, FormData>(
    answerSurveyAction,
    initialSurveyState,
    ({ previous, payload, message }) => ({
      ...previous,
      errors: {},
      values: answersFromFormData(payload, props.fields),
      message,
    }),
  );
  if (state.done) {
    return (
      <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 text-lg font-semibold text-oe-navy">
        {props.labels.thanks}
      </output>
    );
  }
  if (state.state !== "OPEN") {
    return (
      <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
        {state.state === "ANSWERED"
          ? props.labels.answered
          : state.state === "EXPIRED"
            ? props.labels.expired
            : props.labels.notFound}
      </p>
    );
  }
  return (
    <ActionForm action={action} className="flex max-w-2xl flex-col gap-6" noValidate>
      <input type="hidden" name="token" value={props.token} />
      {state.message ? (
        <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
          {state.message}
        </p>
      ) : null}
      <FormFields
        key={JSON.stringify(state.values)}
        fields={props.fields}
        values={state.values}
        errors={state.errors}
        labels={{
          required: props.labels.required,
          multiHelp: props.labels.multiHelp,
          dateHelp: props.labels.dateHelp,
          rating: props.labels.rating,
        }}
        inputClass={inputClass}
      />
      <button type="submit" className="boton-calido self-start" disabled={pending}>
        {props.labels.submit}
      </button>
    </ActionForm>
  );
}
