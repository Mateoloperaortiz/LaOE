"use client";

import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import type { RequestKind } from "@/modules/crm";
import { t, tList } from "@/shared/copy";
import { createRequestAction, withdrawRequestAction } from "./actions";
import type {
  CauseOption,
  CommitteeOption,
  OccasionOption,
  RequestActionState,
} from "./form-state";

const inputClass =
  "w-full min-h-11 rounded-xl border border-borde bg-fondo px-3 py-2 text-base text-tinta focus:border-titulo focus:outline-none focus:ring-2 focus:ring-borde";

function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  return message ? (
    <p id={id} className="text-sm font-semibold text-tinta">
      {message}
    </p>
  ) : null;
}

function CommitteeChoices({
  name,
  label,
  options,
  selected,
  onChange,
  error,
}: {
  name: string;
  label: string;
  options: CommitteeOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  error?: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("es");
  const hasMatches = options.some((option) =>
    option.name.toLocaleLowerCase("es").includes(normalized),
  );
  return (
    <fieldset
      className="min-w-0 rounded-xl border border-borde p-3"
      aria-describedby={error ? `${name}-error` : undefined}
    >
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="flex flex-col gap-2">
        {options.length > 10 ? (
          <label htmlFor={`${name}-search`} className="flex flex-col gap-1 text-sm">
            {t("T-1589")}
            <input
              id={`${name}-search`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={inputClass}
            />
          </label>
        ) : null}
        <p aria-live="polite" className="text-xs text-tinta-suave">
          {t("T-1590", { n: selected.length })}
        </p>
        <div className="grid max-h-72 gap-1 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option.id}
              htmlFor={`${name}-${option.id}`}
              hidden={!option.name.toLocaleLowerCase("es").includes(normalized)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm has-[:checked]:bg-fondo-suave [&[hidden]]:hidden"
            >
              <input
                id={`${name}-${option.id}`}
                name={name}
                type="checkbox"
                value={option.id}
                checked={selected.includes(option.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  )
                }
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${name}-error` : undefined}
                className="size-5 shrink-0 accent-oe-navy"
              />
              <span className="min-w-0 break-words">{option.name}</span>
            </label>
          ))}
        </div>
        {!hasMatches ? (
          <p className="text-sm text-tinta-suave">
            {t(options.length === 0 ? "T-1592" : "T-1591")}
          </p>
        ) : null}
        <FieldError id={`${name}-error`} message={error} />
      </div>
    </fieldset>
  );
}

export function RequestForm({
  kind,
  title,
  explanation,
  currentCommittees,
  otherCommittees,
  occasions = [],
  causes = [],
  policyReady,
  policyNotice,
  existingPending,
  pendingLabel,
  closeHref,
  successHref,
}: {
  kind: RequestKind;
  title: string;
  explanation: string;
  currentCommittees: CommitteeOption[];
  otherCommittees: CommitteeOption[];
  /** Ocasiones que se pueden excusar y causales del Anexo 1 (solo EXCUSE, ADR-060 regla 5). */
  occasions?: OccasionOption[];
  causes?: CauseOption[];
  policyReady: boolean;
  policyNotice: ReactNode;
  existingPending: boolean;
  pendingLabel: string;
  closeHref: string;
  successHref: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sendingRef = useRef(false);
  const [values, setValues] = useState({
    reason: "",
    until: "",
    personalEmail: "",
    occasionId: "",
    cause: "",
    evidence: "",
    lateSubmission: false,
  });
  const [ocasionLabel, causalLabel, soporteLabel] = tList("T-2218") as [string, string, string];
  const [consents, setConsents] = useState({ memorial: false, contact: false, confirm: false });
  const [leaveIds, setLeaveIds] = useState<string[]>([]);
  const [joinIds, setJoinIds] = useState<string[]>([]);
  const [state, action, pending] = useActionState(
    async (previous: RequestActionState, data: FormData): Promise<RequestActionState> => {
      try {
        const result = await createRequestAction(previous, data);
        if (result.success) router.replace(successHref, { scroll: false });
        return result;
      } catch (error) {
        unstable_rethrow(error);
        return { error: t("T-1588") };
      } finally {
        sendingRef.current = false;
      }
    },
    {},
  );
  const blocked = pending || Boolean(state.success);
  const fieldErrors = state.fieldErrors ?? {};
  const [gallery, contact] = tList("T-888");

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.error) {
      const invalid = Array.from(
        formRef.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]:not(:disabled)') ??
          [],
      ).find((element) => element.getClientRects().length > 0);
      (invalid ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
    }
  }, [state]);

  return (
    <section
      id={kind.toLowerCase()}
      aria-labelledby="request-title"
      className="member-request-form flex max-w-3xl flex-col gap-5 rounded-2xl border border-borde bg-fondo p-4 sm:p-6"
    >
      <header className="flex flex-col gap-3">
        <Link
          href={closeHref}
          aria-disabled={blocked}
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline underline-offset-4"
        >
          {t("T-1582")}
        </Link>
        <h2 id="request-title" ref={headingRef} tabIndex={-1} className="text-2xl">
          {title}
        </h2>
        <p id="request-explanation" className="max-w-prose text-sm leading-relaxed">
          {explanation}
        </p>
      </header>
      {existingPending && !state.success ? (
        <p className="rounded-xl border border-borde bg-fondo-suave p-3 text-sm">
          {pendingLabel}{" "}
          <a className="font-semibold underline" href="#solicitudes">
            {t("T-1598")}
          </a>
        </p>
      ) : null}
      <form
        ref={formRef}
        action={action}
        noValidate
        aria-label={t("T-1593")}
        aria-describedby="request-explanation"
        aria-busy={blocked}
        onReset={(event) => {
          // React restablece el formulario al resolver la acción, incluso si devolvió errores.
          // Los valores viven en estado local; solo se descartan al salir del trámite.
          event.preventDefault();
        }}
        onSubmit={(event) => {
          if (sendingRef.current || blocked || existingPending) event.preventDefault();
          else sendingRef.current = true;
        }}
      >
        {state.error ? (
          <p
            role="alert"
            tabIndex={-1}
            className="mb-4 rounded-xl border border-oe-orange bg-fondo-suave p-3 text-sm font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        <fieldset disabled={blocked || existingPending} className="flex min-w-0 flex-col gap-5">
          <input type="hidden" name="kind" value={kind} />
          {kind === "EXCUSE" ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="excuse-occasion" className="text-sm font-semibold">
                  {ocasionLabel}
                </label>
                <select
                  id="excuse-occasion"
                  name="occasionId"
                  required
                  value={values.occasionId}
                  onChange={(event) => setValues({ ...values, occasionId: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.occasionId)}
                  aria-describedby={fieldErrors.occasionId ? "excuse-occasion-error" : undefined}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {occasions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {occasions.length === 0 ? (
                  <p className="text-sm text-tinta-suave">{t("T-2224")}</p>
                ) : null}
                <FieldError id="excuse-occasion-error" message={fieldErrors.occasionId} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="excuse-cause" className="text-sm font-semibold">
                  {causalLabel}
                </label>
                <select
                  id="excuse-cause"
                  name="cause"
                  required
                  value={values.cause}
                  onChange={(event) => setValues({ ...values, cause: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.cause)}
                  aria-describedby={fieldErrors.cause ? "excuse-cause-error" : undefined}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {causes.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldError id="excuse-cause-error" message={fieldErrors.cause} />
              </div>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  name="lateSubmission"
                  checked={values.lateSubmission}
                  onChange={(event) =>
                    setValues({ ...values, lateSubmission: event.target.checked })
                  }
                />
                {t("T-2336")}
              </label>
            </div>
          ) : null}
          {kind === "TRANSFER" ? (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <CommitteeChoices
                name="leaveCommitteeIds"
                label={t("T-884")}
                options={currentCommittees}
                selected={leaveIds}
                onChange={setLeaveIds}
                error={fieldErrors.leaveCommitteeIds}
              />
              <CommitteeChoices
                name="joinCommitteeIds"
                label={t("T-885")}
                options={otherCommittees}
                selected={joinIds}
                onChange={setJoinIds}
                error={fieldErrors.joinCommitteeIds}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <label htmlFor="request-reason" className="text-sm font-semibold">
              {t("T-880")}
            </label>
            <textarea
              id="request-reason"
              name="reason"
              rows={4}
              required
              maxLength={500}
              value={values.reason}
              onChange={(event) => setValues({ ...values, reason: event.target.value })}
              aria-invalid={Boolean(fieldErrors.reason)}
              aria-describedby={`request-reason-help${fieldErrors.reason ? " request-reason-error" : ""}`}
              className={inputClass}
            />
            <p id="request-reason-help" className="text-sm text-tinta-suave">
              {t("T-1585")}
            </p>
            <FieldError id="request-reason-error" message={fieldErrors.reason} />
          </div>
          {kind === "EXCUSE" ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="excuse-evidence" className="text-sm font-semibold">
                {soporteLabel}
              </label>
              <input
                id="excuse-evidence"
                name="evidence"
                type="text"
                maxLength={500}
                value={values.evidence}
                onChange={(event) => setValues({ ...values, evidence: event.target.value })}
                aria-invalid={Boolean(fieldErrors.evidence)}
                aria-describedby={fieldErrors.evidence ? "excuse-evidence-error" : undefined}
                className={inputClass}
              />
              <FieldError id="excuse-evidence-error" message={fieldErrors.evidence} />
            </div>
          ) : null}
          {kind === "LEAVE" ? (
            <div className="flex max-w-sm flex-col gap-2">
              <label htmlFor="leave-until" className="text-sm font-semibold">
                {t("T-881")}
              </label>
              <input
                id="leave-until"
                name="until"
                type="date"
                required
                value={values.until}
                onChange={(event) => setValues({ ...values, until: event.target.value })}
                aria-invalid={Boolean(fieldErrors.until)}
                aria-describedby={`leave-until-help${fieldErrors.until ? " leave-until-error" : ""}`}
                className={inputClass}
              />
              <p id="leave-until-help" className="text-sm text-tinta-suave">
                {t("T-1596")}
              </p>
              <FieldError id="leave-until-error" message={fieldErrors.until} />
            </div>
          ) : null}
          {kind === "RESIGNATION" ? (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-borde p-3">
                <label htmlFor="memorial" className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    id="memorial"
                    type="checkbox"
                    name="memorialConsent"
                    className="size-5 shrink-0 accent-oe-navy"
                    checked={consents.memorial}
                    onChange={(event) =>
                      setConsents({ ...consents, memorial: event.target.checked })
                    }
                    disabled={!policyReady}
                  />
                  {gallery}
                </label>
                <label htmlFor="contact" className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    id="contact"
                    type="checkbox"
                    name="contactConsent"
                    className="size-5 shrink-0 accent-oe-navy"
                    checked={consents.contact}
                    onChange={(event) =>
                      setConsents({ ...consents, contact: event.target.checked })
                    }
                    disabled={!policyReady}
                  />
                  {contact}
                </label>
                {policyNotice}
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="personal-email" className="text-sm font-semibold">
                  {t("T-889")}
                </label>
                <input
                  id="personal-email"
                  name="personalEmail"
                  type="email"
                  maxLength={254}
                  value={values.personalEmail}
                  onChange={(event) => setValues({ ...values, personalEmail: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.personalEmail)}
                  aria-describedby={fieldErrors.personalEmail ? "personal-email-error" : undefined}
                  className={inputClass}
                />
                <FieldError id="personal-email-error" message={fieldErrors.personalEmail} />
              </div>
              <div className="flex flex-col gap-2 rounded-xl border border-oe-orange p-3">
                <label htmlFor="confirm" className="flex min-h-11 items-start gap-3 text-sm">
                  <input
                    id="confirm"
                    type="checkbox"
                    name="confirm"
                    className="mt-1 size-5 shrink-0 accent-oe-navy"
                    required
                    checked={consents.confirm}
                    onChange={(event) =>
                      setConsents({ ...consents, confirm: event.target.checked })
                    }
                    aria-invalid={Boolean(fieldErrors.confirm)}
                    aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
                  />
                  {t("T-890")}
                </label>
                <FieldError id="confirm-error" message={fieldErrors.confirm} />
              </div>
            </>
          ) : null}
          <footer className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
            <button type="submit" className="boton-calido">
              {blocked ? t("T-1583") : t("T-893")}
            </button>
            <output className="sr-only">{blocked ? t("T-1583") : ""}</output>
          </footer>
        </fieldset>
      </form>
    </section>
  );
}

export function WithdrawRequest({
  requestId,
  successHref,
}: {
  requestId: string;
  successHref: string;
}) {
  const router = useRouter();
  const busyRef = useRef(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [state, action, pending] = useActionState(
    async (previous: RequestActionState, data: FormData): Promise<RequestActionState> => {
      try {
        const result = await withdrawRequestAction(previous, data);
        if (result.success) router.replace(successHref, { scroll: false });
        return result;
      } catch (error) {
        unstable_rethrow(error);
        return { error: t("T-1595") };
      } finally {
        busyRef.current = false;
      }
    },
    {},
  );
  useEffect(() => {
    if (state.error) alertRef.current?.focus();
  }, [state]);
  return (
    <form
      action={action}
      aria-busy={pending}
      onSubmit={(event) => {
        if (busyRef.current || pending || state.success) event.preventDefault();
        else busyRef.current = true;
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        className="boton-secundario min-h-11 self-start px-4 text-sm"
        disabled={pending || state.success}
      >
        {pending ? t("T-1594") : t("T-878")}
      </button>
      <output className="sr-only">{pending ? t("T-1594") : ""}</output>
      {state.error ? (
        <p ref={alertRef} role="alert" tabIndex={-1}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function RequestResult({ message }: { message: string }) {
  const ref = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <output
      ref={ref}
      tabIndex={-1}
      className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy"
    >
      {message}
    </output>
  );
}
