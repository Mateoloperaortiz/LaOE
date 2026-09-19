"use client";

import { unstable_rethrow } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { t } from "@/shared/copy/client";
import {
  type ContactState,
  type PreferencesState,
  updateContactAction,
  updatePreferencesAction,
} from "./actions";

// React 19 reinicia el formulario después de resolver la acción. Estos formularios son
// controlados: se conserva su estado también para casillas cuyo defaultChecked quedó inicial.
const inputClass = "w-full rounded-xl border border-borde bg-fondo px-3 py-2 text-tinta";

export function ContactForm({
  email,
  phone,
  personalEmail,
}: {
  email: string;
  phone: string;
  personalEmail: string;
}) {
  const [values, setValues] = useState({ phone, personalEmail });
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [state, action, pending] = useActionState(
    async (previous: ContactState, data: FormData): Promise<ContactState> => {
      try {
        return await updateContactAction(previous, data);
      } catch (error) {
        unstable_rethrow(error);
        return { status: "error", message: t("T-1629"), errors: {} };
      } finally {
        busy.current = false;
      }
    },
    { status: "idle", errors: {} },
  );

  useEffect(() => {
    if (state.status === "error") {
      const target = form.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [role="alert"]',
      );
      target?.focus();
    } else if (state.status === "done" && state.values) setValues(state.values);
  }, [state]);

  return (
    <form
      ref={form}
      action={action}
      onReset={(event) => event.preventDefault()}
      onSubmit={(event) => {
        if (busy.current) event.preventDefault();
        else busy.current = true;
      }}
      className="flex max-w-xl flex-col gap-4"
    >
      <fieldset disabled={pending} aria-busy={pending} className="flex min-w-0 flex-col gap-4">
        <legend className="mb-3 font-bold">{t("T-1630")}</legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="email">{t("T-406")}</label>
          <input id="email" type="email" value={email} readOnly className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="phone">{t("T-404")}</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={(event) => setValues({ ...values, phone: event.target.value })}
            autoComplete="tel"
            className={inputClass}
            aria-invalid={!!state.errors.phone || undefined}
            aria-describedby={state.errors.phone ? "phone-error" : undefined}
          />
          {state.errors.phone ? (
            <p id="phone-error" className="text-sm">
              {state.errors.phone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="personalEmail">{t("T-405")}</label>
          <input
            id="personalEmail"
            name="personalEmail"
            type="email"
            value={values.personalEmail}
            onChange={(event) => setValues({ ...values, personalEmail: event.target.value })}
            autoComplete="email"
            className={inputClass}
            aria-invalid={!!state.errors.personalEmail || undefined}
            aria-describedby={state.errors.personalEmail ? "personal-email-error" : undefined}
          />
          {state.errors.personalEmail ? (
            <p id="personal-email-error" className="text-sm">
              {state.errors.personalEmail}
            </p>
          ) : null}
        </div>
        <button type="submit" className="boton-primario self-start">
          {pending ? t("T-1628") : t("T-253")}
        </button>
      </fieldset>
      {state.status === "error" ? (
        <p role="alert" tabIndex={-1} className="rounded-lg border border-oe-orange p-3 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <output className="text-sm font-semibold" aria-live="polite">
          {t("T-259")}
        </output>
      ) : null}
    </form>
  );
}

export function PreferencesForm({
  items,
}: {
  items: { name: string; label: string; checked: boolean }[];
}) {
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(items.map((item) => [item.name, item.checked])),
  );
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: PreferencesState, data: FormData): Promise<PreferencesState> => {
      try {
        return await updatePreferencesAction(previous, data);
      } catch (error) {
        unstable_rethrow(error);
        return { status: "error", message: t("T-1629") };
      } finally {
        busy.current = false;
      }
    },
    { status: "idle" },
  );
  useEffect(() => {
    if (state.status === "error")
      form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [state]);
  return (
    <form
      ref={form}
      action={action}
      onReset={(event) => event.preventDefault()}
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        if (busy.current) event.preventDefault();
        else busy.current = true;
      }}
    >
      <fieldset disabled={pending} aria-busy={pending} className="flex min-w-0 flex-col gap-4">
        <legend className="sr-only">{t("T-1079")}</legend>
        {items.map((item) => (
          <label key={item.name} className="flex min-h-11 items-center gap-3 font-semibold">
            <input
              name={item.name}
              type="checkbox"
              checked={values[item.name]}
              onChange={(event) => setValues({ ...values, [item.name]: event.target.checked })}
              className="size-5 shrink-0 accent-oe-navy"
            />
            {item.label}
          </label>
        ))}
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-1081")}</p>
        <button type="submit" className="boton-primario self-start">
          {pending ? t("T-1628") : t("T-1083")}
        </button>
      </fieldset>
      {state.status === "error" ? (
        <p role="alert" tabIndex={-1} className="rounded-lg border border-oe-orange p-3 text-sm">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <output className="text-sm font-semibold" aria-live="polite">
          {t("T-1082")}
        </output>
      ) : null}
    </form>
  );
}
