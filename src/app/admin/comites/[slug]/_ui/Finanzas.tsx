import { createId } from "@paralleldrive/cuid2";
import type { BudgetSummary, EventApprovalListRow } from "@/modules/finance";
import {
  approvalStatusLabel,
  budgetKindLabel,
  CONTRACT_FILE_MAX_BYTES,
  CONTRACT_FILE_SLOTS,
  contractStatusLabel,
  type listContracts,
  RISK_LEVELS,
  riskLevelLabel,
} from "@/modules/finance";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { formatExactMoney } from "@/shared/lib/money";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { RiesgoBadge } from "../../../_kit/aval";
import { ContractDetails } from "../../../_kit/ContractDetails";
import { FinancialApprovals } from "../../../_kit/FinancialApprovals";
import {
  recordPurchasePaymentAction,
  requestApprovalAction,
  requestExtraordinaryAction,
  requestPurchaseAction,
  requestTransferAction,
  resubmitApprovalAction,
  submitPrerequestAction,
} from "../actions";
import { ContractForm } from "./ContractForm";

// Área Finanzas del comité (ADR-059 regla 2; ADR-060 regla 12): con la capacidad FINANCE se ve el
// resumen por rubro de cada presupuesto del año, se registra la presolicitud del mes, un gasto o un
// traslado, y se pide el aval de un evento a la Presidencia. Rubros y montos los fija la junta. El aval
// lleva el semáforo de riesgo y, si la Presidencia lo devuelve, aquí se corrige (ADR-197).

interface Props {
  slug: string;
  year: number;
  budgets: BudgetSummary[];
  contracts: Awaited<ReturnType<typeof listContracts>>;
  approvals: EventApprovalListRow[];
  /** Los comentarios de la última devolución de cada aval devuelto. */
  returned: Record<string, string>;
  editions: Array<{ id: string; label: string }>;
  guardado: string;
}

/** El semáforo que declara el comité, con su porqué (ADR-197 regla 2). */
function CamposRiesgo({
  prefix,
  level,
  justification,
}: {
  prefix: string;
  level?: string | null;
  justification?: string;
}) {
  const [riesgo, porQue] = tList("T-5103");
  return (
    <>
      <Campo id={`${prefix}-riskLevel`} label={riesgo ?? ""}>
        <select
          id={`${prefix}-riskLevel`}
          name="riskLevel"
          required
          className={inputClass}
          defaultValue={level ?? ""}
        >
          <option value="" disabled>
            —
          </option>
          {RISK_LEVELS.map((item) => (
            <option key={item} value={item}>
              {riskLevelLabel(item)}
            </option>
          ))}
        </select>
      </Campo>
      <Campo id={`${prefix}-riskJustification`} label={porQue ?? ""}>
        <textarea
          id={`${prefix}-riskJustification`}
          name="riskJustification"
          required
          minLength={2}
          maxLength={1000}
          rows={2}
          defaultValue={justification ?? ""}
          className={inputClass}
        />
      </Campo>
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-5104")}</p>
    </>
  );
}

function civil(key: string): string {
  return formatDate(new Date(`${key}T12:00:00Z`));
}

export function Finanzas({
  slug,
  year,
  budgets,
  approvals,
  contracts,
  returned,
  editions,
  guardado,
}: Props) {
  const contractFormId = createId();
  const [tituloPresupuesto, rubrosTitulo] = tList("T-2190");
  const [rubro, asignado, gastado, trasladado, disponible] = tList("T-2191");
  const [fecha, rubroCampo, monto, descripcion] = tList("T-2194");
  const [desde, hacia, montoTraslado, motivo] = tList("T-2195");
  const [presolTitulo, mes, notas, registrarPresol, presolOk] = tList("T-2298");
  const [avalesTitulo, evento, fechaEvento, edicion, descripcionAval, pedirAval, avalOk] =
    tList("T-2299");
  const [avalCampo, proveedor, sinAval] = tList("T-2307");
  const [, , sinAvales] = tList("T-2311");
  const [devueltoTexto, enviarVersion, versionOk, corregir] = tList("T-5109");
  const [imprimir] = tList("T-5114");
  const aprobados = approvals.filter((item) => item.status === "APPROVED");
  const hidden = <input type="hidden" name="slug" value={slug} />;
  const confirmaciones: Record<string, string | undefined> = {
    compra: t("T-2198"),
    pago: t("T-5166"),
    contrato: tList("T-5175")[2],
    traslado: t("T-2199"),
    extraordinario: tList("T-5159")[2],
    presolicitud: presolOk,
    aval: avalOk,
    version: versionOk,
  };

  return (
    <section aria-label={tList("T-2174")[4] ?? ""} className="flex flex-col gap-8">
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-2205")}</p>
      {guardado && confirmaciones[guardado] ? (
        <output className="block rounded-xl border-2 border-borde px-4 py-2 text-sm">
          {confirmaciones[guardado]}
        </output>
      ) : null}
      {budgets.length === 0 ? <p className="text-lg">{t("T-2197", { año: year })}</p> : null}
      {budgets.map(({ budget, lines, rawLines, totals, prerequests, financialApprovals }) => (
        <section
          key={budget.id}
          aria-labelledby={`presupuesto-${budget.id}`}
          className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde p-4"
        >
          <h3 id={`presupuesto-${budget.id}`} className="text-display-md">
            {budget.kind === "EXTRAORDINARY"
              ? t("T-2309", { actividad: budget.title })
              : t("T-2190", { año: budget.year }).split(" · ")[0]}
            {budget.kind === "EXTRAORDINARY" ? "" : ` · ${budgetKindLabel(budget.kind)}`}
          </h3>
          <p className="text-sm">
            {t("T-2310", {
              asignado: formatExactMoney(totals.assigned),
              gastado: formatExactMoney(totals.spent),
              disponible: formatExactMoney(totals.available),
            })}
            {budget.status !== "OPEN" ? (
              <span className="text-tinta-suave"> · {t("T-2204", { año: budget.year })}</span>
            ) : null}
          </p>
          <FinancialApprovals
            budget={budget}
            history={financialApprovals}
            action={requestExtraordinaryAction}
            paymentAction={recordPurchasePaymentAction}
            slug={slug}
          />
          <AdminTableRegion
            label={`${rubrosTitulo ?? ""} ${tituloPresupuesto ?? ""}`.trim()}
            className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde"
          >
            <table className="admin-data-table w-full text-left text-sm">
              <thead className="eyebrow bg-fondo-suave text-xs">
                <tr>
                  {[rubro, asignado, gastado, trasladado, disponible].map((label) => (
                    <th scope="col" key={label} className="px-3 py-2">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-t border-borde">
                    <td className="px-3 py-2">{line.name}</td>
                    <td className="px-3 py-2">{formatExactMoney(line.assigned)}</td>
                    <td className="px-3 py-2">{formatExactMoney(line.spent)}</td>
                    <td className="px-3 py-2">
                      {formatExactMoney(line.transferredIn - line.transferredOut)}
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatExactMoney(line.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
          {budget.status === "OPEN" ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <ActionForm action={submitPrerequestAction} className="flex flex-col gap-3">
                <AdminFormBody>
                  {hidden}
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <h4 className="font-semibold">{presolTitulo}</h4>
                  <p className="text-xs text-tinta-suave">
                    {prerequests.map((item) => item.month).join(" · ") || "—"}
                  </p>
                  <Campo id={`presol-${budget.id}-month`} label={mes ?? ""}>
                    <input
                      id={`presol-${budget.id}-month`}
                      name="month"
                      type="month"
                      required
                      defaultValue={todayKey().slice(0, 7)}
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`presol-${budget.id}-notes`} label={notas ?? ""}>
                    <input id={`presol-${budget.id}-notes`} name="notes" className={inputClass} />
                  </Campo>
                  <AdminSubmitButton type="submit" className="boton-secundario self-start">
                    {registrarPresol}
                  </AdminSubmitButton>
                </AdminFormBody>
              </ActionForm>
              <ActionForm action={requestPurchaseAction} className="flex flex-col gap-3">
                <AdminFormBody>
                  {hidden}
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <h4 className="font-semibold">{t("T-2192")}</h4>
                  <input type="hidden" name="requestId" value={createId()} />
                  <Campo id={`compra-${budget.id}-plannedOn`} label={fecha ?? ""}>
                    <input
                      id={`compra-${budget.id}-plannedOn`}
                      name="plannedOn"
                      type="date"
                      required
                      defaultValue={todayKey()}
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`gasto-${budget.id}-lineId`} label={rubroCampo ?? ""}>
                    <select
                      id={`gasto-${budget.id}-lineId`}
                      name="lineId"
                      required
                      className={inputClass}
                    >
                      {rawLines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.name}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo id={`gasto-${budget.id}-amount`} label={monto ?? ""}>
                    <input
                      id={`gasto-${budget.id}-amount`}
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`gasto-${budget.id}-description`} label={descripcion ?? ""}>
                    <input
                      id={`gasto-${budget.id}-description`}
                      name="description"
                      required
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`gasto-${budget.id}-supplier`} label={proveedor ?? ""}>
                    <input
                      id={`gasto-${budget.id}-supplier`}
                      name="supplier"
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`gasto-${budget.id}-approvalId`} label={avalCampo ?? ""}>
                    <select
                      id={`gasto-${budget.id}-approvalId`}
                      name="approvalId"
                      className={inputClass}
                    >
                      <option value="">{sinAval}</option>
                      {aprobados
                        .filter(
                          (item) =>
                            (!item.budgetId || item.budgetId === budget.id) &&
                            Number(item.eventOn.slice(0, 4)) === budget.year,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} · {civil(item.eventOn)}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  <AdminSubmitButton type="submit" className="boton-primario self-start">
                    {t("T-2192")}
                  </AdminSubmitButton>
                </AdminFormBody>
              </ActionForm>
              <ActionForm action={requestTransferAction} className="flex flex-col gap-3">
                <AdminFormBody>
                  {hidden}
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <h4 className="font-semibold">{t("T-2193")}</h4>
                  {(
                    [
                      ["fromLineId", desde],
                      ["toLineId", hacia],
                    ] as const
                  ).map(([name, label]) => (
                    <Campo key={name} id={`traslado-${budget.id}-${name}`} label={label ?? ""}>
                      <select
                        id={`traslado-${budget.id}-${name}`}
                        name={name}
                        required
                        className={inputClass}
                      >
                        {rawLines.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.name}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  ))}
                  <Campo id={`traslado-${budget.id}-amount`} label={montoTraslado ?? ""}>
                    <input
                      id={`traslado-${budget.id}-amount`}
                      name="amount"
                      type="number"
                      min={1}
                      step="0.01"
                      required
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`traslado-${budget.id}-reason`} label={motivo ?? ""}>
                    <input
                      id={`traslado-${budget.id}-reason`}
                      name="reason"
                      required
                      className={inputClass}
                    />
                  </Campo>
                  <Campo id={`traslado-${budget.id}-approvalId`} label={t("T-2334")}>
                    <select
                      required
                      id={`traslado-${budget.id}-approvalId`}
                      name="approvalId"
                      className={inputClass}
                    >
                      <option value="">{sinAval}</option>
                      {aprobados
                        .filter(
                          (item) =>
                            (!item.budgetId || item.budgetId === budget.id) &&
                            Number(item.eventOn.slice(0, 4)) === budget.year &&
                            item.eventOn > todayKey(),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} · {civil(item.eventOn)}
                          </option>
                        ))}
                    </select>
                  </Campo>
                  <AdminSubmitButton type="submit" className="boton-secundario self-start">
                    {t("T-2193")}
                  </AdminSubmitButton>
                </AdminFormBody>
              </ActionForm>
            </div>
          ) : null}
        </section>
      ))}

      <section aria-labelledby="contratos-comite" className="flex flex-col gap-3">
        <h3 id="contratos-comite" className="text-display-md">
          {tList("T-5171")[0]}
        </h3>
        {contracts.map((row) => (
          <details key={row.id} className="rounded-xl border border-borde p-3">
            <summary>
              {row.title} · {contractStatusLabel(row.status)}
            </summary>
            <ContractDetails row={row} />
          </details>
        ))}
        <ContractForm
          key={slug}
          id={contractFormId}
          maxBytes={CONTRACT_FILE_MAX_BYTES}
          slug={slug}
          slots={CONTRACT_FILE_SLOTS.map((slot) => ({
            slot,
            label: tLabels("T-5172", CONTRACT_FILE_SLOTS)[slot],
          }))}
          fields={tList("T-5171")}
          invalid={t("T-5174")}
          progress={tList("T-5177")}
        />
      </section>
      <section aria-labelledby="avales-comite" className="flex flex-col gap-3">
        <h3 id="avales-comite" className="text-display-md">
          {avalesTitulo}
        </h3>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2301")}</p>
        {approvals.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinAvales}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0 text-sm">
            {approvals.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.title}</span> · {civil(item.eventOn)}
                <Insignia
                  fondo={
                    item.status === "APPROVED"
                      ? "azul"
                      : item.status === "REJECTED"
                        ? "naranja"
                        : "paper"
                  }
                >
                  {approvalStatusLabel(item.status)}
                </Insignia>
                <RiesgoBadge level={item.riskLevel} />
                {item.decisionNote ? (
                  <span className="text-tinta-suave">· {item.decisionNote}</span>
                ) : null}
                <Link href={`/admin/avales/${item.id}/imprimir`} className="text-sm">
                  {imprimir}
                </Link>
                {item.status === "RETURNED" ? (
                  <div className="flex w-full flex-col gap-2 rounded-xl border-2 border-borde p-3">
                    <p className="m-0">{devueltoTexto}</p>
                    {returned[item.id] ? (
                      <p className="m-0 whitespace-pre-line">{returned[item.id]}</p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer font-semibold">{corregir}</summary>
                      <ActionForm
                        action={resubmitApprovalAction}
                        className="mt-3 flex max-w-xl flex-col gap-3"
                      >
                        <AdminFormBody>
                          {hidden}
                          <input type="hidden" name="approvalId" value={item.id} />
                          <Campo id={`version-${item.id}-title`} label={evento ?? ""}>
                            <input
                              id={`version-${item.id}-title`}
                              name="title"
                              required
                              defaultValue={item.title}
                              className={inputClass}
                            />
                          </Campo>
                          <Campo id={`version-${item.id}-eventOn`} label={fechaEvento ?? ""}>
                            <input
                              id={`version-${item.id}-eventOn`}
                              name="eventOn"
                              type="date"
                              required
                              defaultValue={item.eventOn}
                              className={inputClass}
                            />
                          </Campo>
                          <Campo
                            id={`version-${item.id}-description`}
                            label={descripcionAval ?? ""}
                          >
                            <textarea
                              id={`version-${item.id}-description`}
                              name="description"
                              rows={3}
                              defaultValue={item.description}
                              className={inputClass}
                            />
                          </Campo>
                          <CamposRiesgo
                            prefix={`version-${item.id}`}
                            level={item.riskLevel}
                            justification={item.riskJustification}
                          />
                          <AdminSubmitButton type="submit" className="boton-secundario self-start">
                            {enviarVersion}
                          </AdminSubmitButton>
                        </AdminFormBody>
                      </ActionForm>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={requestApprovalAction} className="flex max-w-xl flex-col gap-3">
          <AdminFormBody>
            {hidden}
            <input type="hidden" name="budgetId" value={budgets[0]?.budget.id ?? ""} />
            <Campo id="aval-title" label={evento ?? ""}>
              <input id="aval-title" name="title" required className={inputClass} />
            </Campo>
            <Campo id="aval-eventOn" label={fechaEvento ?? ""}>
              <input id="aval-eventOn" name="eventOn" type="date" required className={inputClass} />
            </Campo>
            <Campo id="aval-editionId" label={edicion ?? ""}>
              <select id="aval-editionId" name="editionId" className={inputClass} defaultValue="">
                <option value="">—</option>
                {editions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="aval-description" label={descripcionAval ?? ""}>
              <textarea id="aval-description" name="description" rows={3} className={inputClass} />
            </Campo>
            <CamposRiesgo prefix="aval" />
            <AdminSubmitButton type="submit" className="boton-secundario self-start">
              {pedirAval}
            </AdminSubmitButton>
          </AdminFormBody>
        </ActionForm>
      </section>
    </section>
  );
}
