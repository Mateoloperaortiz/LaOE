"use client";

import { useState } from "react";
import { APP_TIME_ZONE } from "@/shared/lib/dates-pure";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { issueGrantAction } from "./acceso-actions";
import { type IssueGrantState, initialIssueGrantState, issueGrantRejected } from "./acceso-state";

export interface IssueGrantLabels {
  submit: string;
  activation: string;
  recovery: string;
  once: string;
  handover: string;
  copy: string;
  copied: string;
}

type Props = {
  personId: string;
  returnTo: string;
  labels: IssueGrantLabels;
  /** Al emitir para otra persona en la jornada, el panel se remonta con `key` y vuelve a cero. */
  onIssued?: () => void;
};

function Emitido({ state, labels }: { state: IssueGrantState; labels: IssueGrantLabels }) {
  const [copied, setCopied] = useState(false);
  if (!state.url) {
    return null;
  }
  const vence = state.expiresAt
    ? new Intl.DateTimeFormat("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIME_ZONE,
      }).format(new Date(state.expiresAt))
    : "";
  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-titulo p-4">
      <p className="font-semibold">{labels.once.replace("{hora}", vence)}</p>
      {state.qrSvg ? (
        <div
          className="mx-auto w-full max-w-[15rem] [&>svg]:h-auto [&>svg]:w-full"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generado en servidor por `qrcode`, sin datos externos
          dangerouslySetInnerHTML={{ __html: state.qrSvg }}
        />
      ) : null}
      <code className="break-all rounded-lg bg-fondo-suave px-3 py-2 text-sm">{state.url}</code>
      <button
        type="button"
        className="boton-secundario self-start text-sm"
        onClick={() => {
          navigator.clipboard?.writeText(state.url ?? "").then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? labels.copied : labels.copy}
      </button>
      <p className="text-sm text-tinta-suave">{labels.handover}</p>
    </div>
  );
}

// Emisión del enlace de acceso (ADR-051): el enlace vive solo en el estado de este formulario.
export function IssueGrantPanel({ personId, returnTo, labels, onIssued }: Props) {
  const [state, action, pending] = useGuardedActionState(
    issueGrantAction,
    initialIssueGrantState,
    issueGrantRejected,
  );
  const kind = state.kind ?? "ACTIVATION";

  return (
    <div className="flex flex-col gap-4">
      <form
        action={(formData) => {
          action(formData);
          onIssued?.();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="flex flex-col gap-2">
          <label htmlFor={`kind-${personId}`} className="eyebrow">
            {labels.submit}
          </label>
          {/* Un `<select>` no sigue a su `defaultValue` cuando React reinicia el formulario: la `key` lo
              remonta con el tipo que quedó elegido (ADR-118 regla 20). */}
          <select
            key={kind}
            id={`kind-${personId}`}
            name="kind"
            defaultValue={kind}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta"
          >
            <option value="ACTIVATION">{labels.activation}</option>
            <option value="RECOVERY">{labels.recovery}</option>
          </select>
        </div>
        <button type="submit" disabled={pending} className="boton-secundario disabled:opacity-60">
          {labels.submit}
        </button>
      </form>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-oe-orange px-3 py-2 text-sm font-semibold text-oe-navy"
        >
          {state.error}
        </p>
      ) : null}
      <Emitido state={state} labels={labels} />
    </div>
  );
}
