"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PermanenceBonusGroup } from "@/modules/permanence";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import { parseBonusTotal } from "./bonus-input";

type BonusState = { error: string; refresh?: boolean } | null;

const decimal = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function BonusForm({
  groups,
  action,
  back,
  requestId,
}: {
  groups: Array<PermanenceBonusGroup & { title: string }>;
  action: (state: BonusState, formData: FormData) => Promise<BonusState>;
  back: string;
  requestId: string;
}) {
  const router = useRouter();
  const [state, submit, pending] = useGuardedActionState<BonusState>(
    action,
    null,
    ({ message }) => ({ error: message }),
  );
  const [operationId] = useState(requestId);
  const [selected, setSelected] = useState<string[]>([]);
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  const error = useRef<HTMLParagraphElement>(null);
  const required = groups
    .flatMap((group) => group.criteria)
    .filter((criterion) => selected.includes(criterion.ruleId))
    .reduce((sum, criterion) => sum + criterion.missing, 0);
  const amount = Math.round(parseBonusTotal(total) * 100);
  const wrongTotal = total !== "" && required > 0 && amount !== required;

  useEffect(() => {
    if (!state) return;
    error.current?.focus();
    if (state.refresh) router.refresh();
  }, [router, state]);

  return (
    <ActionForm action={submit} className="flex flex-col gap-4">
      {state ? (
        <p ref={error} role="alert" tabIndex={-1} className="text-sm font-semibold">
          {state.error}
        </p>
      ) : null}
      <AdminFormBody>
        <input type="hidden" name="requestId" value={operationId} />
        <p className="text-sm text-tinta-suave">{t("T-4872")}</p>
        {groups.map((group) => (
          <fieldset
            key={group.committeeId ?? "general"}
            className="rounded-xl border border-borde px-3 py-1"
          >
            <legend className="px-1 text-sm font-semibold">{group.title}</legend>
            {group.criteria.map((criterion) => (
              <label
                key={criterion.ruleId}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm has-checked:bg-fondo-suave"
              >
                <input
                  type="checkbox"
                  name="ruleIds"
                  value={criterion.ruleId}
                  checked={selected.includes(criterion.ruleId)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, criterion.ruleId]
                        : selected.filter((id) => id !== criterion.ruleId),
                    )
                  }
                  className="mt-0.5 size-5 shrink-0 accent-oe-navy"
                />
                <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-2">
                  <span>{criterion.label}</span>
                  <span className="shrink-0 tabular-nums text-tinta-suave">
                    {t("T-4873", { n: decimal.format(criterion.missing / 100) })}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
        <output className="rounded-lg bg-fondo-suave p-3 text-sm font-semibold tabular-nums">
          {t("T-4864", { n: decimal.format(required / 100) })}
        </output>
        <Campo
          id="bonus-total"
          label={t("T-4868")}
          {...(wrongTotal ? { help: t("T-4865", { n: decimal.format(required / 100) }) } : {})}
        >
          <input
            id="bonus-total"
            name="total"
            inputMode="decimal"
            required
            aria-invalid={wrongTotal || undefined}
            className={inputClass}
            value={total}
            onChange={(event) => setTotal(event.target.value)}
          />
        </Campo>
        <Campo id="bonus-reason" label={t("T-4869")}>
          <textarea
            id="bonus-reason"
            name="reason"
            rows={3}
            required
            maxLength={1000}
            className={inputClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Campo>
        <div className="flex flex-wrap items-center gap-3">
          <AdminSubmitButton
            disabled={pending || required === 0 || amount !== required || !reason.trim()}
            className="boton-calido"
          >
            {t("T-4874")}
          </AdminSubmitButton>
          <Link href={back} scroll={false} className="boton-secundario">
            {t("T-254")}
          </Link>
        </div>
      </AdminFormBody>
    </ActionForm>
  );
}
