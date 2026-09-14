import type { BudgetSummary, EventApprovalListRow } from "@/modules/finance";
import { approvalStatusLabel, budgetKindLabel } from "@/modules/finance";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import {
  recordExpenseAction,
  recordTransferAction,
  requestApprovalAction,
  submitPrerequestAction,
} from "../actions";

// Área Finanzas del comité (ADR-059 regla 2; ADR-060 regla 12): con la capacidad FINANCE se ve el
// resumen por rubro de cada presupuesto del año, se registra la presolicitud del mes, un gasto o un
// traslado, y se pide el aval de un evento a la Presidencia. Rubros y montos los fija la junta.

interface Props {
  slug: string;
  year: number;
  budgets: BudgetSummary[];
  approvals: EventApprovalListRow[];
  editions: Array<{ id: string; label: string }>;
  guardado: string;
}

function civil(key: string): string {
  return formatDate(new Date(`${key}T12:00:00Z`));
}

export function Finanzas({ slug, year, budgets, approvals, editions, guardado }: Props) {
  const [tituloPresupuesto, rubrosTitulo] = tList("T-2190");
  const [rubro, asignado, gastado, trasladado, disponible] = tList("T-2191");
  const [fecha, rubroCampo, monto, descripcion] = tList("T-2194");
  const [desde, hacia, montoTraslado, motivo] = tList("T-2195");
  const [presolTitulo, mes, notas, registrarPresol, presolOk] = tList("T-2298");
  const [avalesTitulo, evento, fechaEvento, edicion, descripcionAval, pedirAval, avalOk] =
    tList("T-2299");
  const [avalCampo, proveedor, sinAval] = tList("T-2307");
  const [, , sinAvales] = tList("T-2311");
  const aprobados = approvals.filter((item) => item.status === "APPROVED");
  const hidden = <input type="hidden" name="slug" value={slug} />;
  const confirmaciones: Record<string, string | undefined> = {
    gasto: t("T-2198"),
    traslado: t("T-2199"),
    presolicitud: presolOk,
    aval: avalOk,
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
      {budgets.map(({ budget, lines, rawLines, totals, prerequests }) => (
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
              asignado: formatMoney(totals.assigned),
              gastado: formatMoney(totals.spent),
              disponible: formatMoney(totals.available),
            })}
            {budget.status !== "OPEN" ? (
              <span className="text-tinta-suave"> · {t("T-2204", { año: budget.year })}</span>
            ) : null}
          </p>
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
                    <td className="px-3 py-2">{formatMoney(line.assigned)}</td>
                    <td className="px-3 py-2">{formatMoney(line.spent)}</td>
                    <td className="px-3 py-2">
                      {formatMoney(line.transferredIn - line.transferredOut)}
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatMoney(line.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
          {budget.status === "OPEN" ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <form action={submitPrerequestAction} className="flex flex-col gap-3">
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
              </form>
              <form action={recordExpenseAction} className="flex flex-col gap-3">
                <AdminFormBody>
                  {hidden}
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <h4 className="font-semibold">{t("T-2192")}</h4>
                  <Campo id={`gasto-${budget.id}-spentOn`} label={fecha ?? ""}>
                    <input
                      id={`gasto-${budget.id}-spentOn`}
                      name="spentOn"
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
                      min={1}
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
              </form>
              <form action={recordTransferAction} className="flex flex-col gap-3">
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
              </form>
            </div>
          ) : null}
        </section>
      ))}

      <section aria-labelledby="avales-comite" className="flex flex-col gap-3">
        <h3 id="avales-comite" className="text-display-md">
          {avalesTitulo}
        </h3>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2301")}</p>
        {approvals.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinAvales}</p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm">
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
                {item.decisionNote ? (
                  <span className="text-tinta-suave">· {item.decisionNote}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form action={requestApprovalAction} className="flex max-w-xl flex-col gap-3">
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
            <AdminSubmitButton type="submit" className="boton-secundario self-start">
              {pedirAval}
            </AdminSubmitButton>
          </AdminFormBody>
        </form>
      </section>
    </section>
  );
}
