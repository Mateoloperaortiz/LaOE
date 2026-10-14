import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import {
  APPROVERS,
  approvalStatusLabel,
  budgetKindLabel,
  budgetStatusLabel,
  getBudgetSummary,
  LATE_BUDGET_SANCTION_PERCENT,
} from "@/modules/finance";
import { requireAdminActor } from "@/modules/identity";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime, todayKey } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import {
  approveAction,
  closeAction,
  decideApprovalAction,
  openAction,
  sanctionAction,
  setLinesAction,
} from "./actions";

// Detalle de un presupuesto (ADR-059, ADR-060 regla 12): rubros, aprobaciones, apertura y cierre,
// sanción, presolicitudes, avales (la Presidencia decide) y movimientos.

const ID = /^[a-z0-9-]{10,40}$/;
const BLANK_LINES = 3;

type Search = Record<string, string | string[] | undefined>;

function civil(key: string): string {
  return formatDate(new Date(`${key}T12:00:00Z`));
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/presupuestos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const summary = ID.test(id) ? await getBudgetSummary(id) : null;
  const [, singular] = tList("T-2200");
  return {
    title: summary
      ? `${singular} · ${summary.budget.committeeName} ${summary.budget.year}`
      : singular,
  };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/presupuestos/[id]">) {
  const { id } = await params;
  const summary = ID.test(id) ? await getBudgetSummary(id) : null;
  if (!summary) {
    notFound();
  }
  await requireAdminActor(`/admin/presupuestos/${id}`);
  const search: Search = await searchParams;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const { budget, lines, rawLines, totals, prerequests, approvals, expenses, transfers } = summary;
  const [plural] = tList("T-2200");
  const [rubro, asignado, gastado, trasladado, disponible] = tList("T-2191");
  const [nombre, asignadoCampo, orden] = tList("T-2203");
  const [aprobaciones, sancionTitulo, presolicitudes, avales, movimientos] = tList("T-2302");
  const [registrarAprobacion, abrir, cerrar, aplicarSancion, guardarRubros, aprobar, rechazar] =
    tList("T-2303");
  const aprobadores = tLabels("T-2304", APPROVERS);
  const [sinMovimientos, sinPresolicitudes, sinAvales] = tList("T-2311");
  const [quienAprueba, fecha, porcentaje, motivo, notaDecision] = tList("T-2312");
  const [, , presentadoEl, aprobDE, aprobVP, sancionCampo, motivoSancion] = tList("T-2288");
  const editable = budget.status !== "CLOSED";
  const rows = [...rawLines, ...Array.from({ length: BLANK_LINES }, () => null)];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/admin/presupuestos" className="text-sm underline">
          {plural}
        </Link>
        <h1 className="text-display-lg">
          {budget.committeeName} · {budget.year} ·{" "}
          {budget.kind === "EXTRAORDINARY"
            ? t("T-2309", { actividad: budget.title })
            : budgetKindLabel(budget.kind)}
        </h1>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Insignia fondo={budget.status === "OPEN" ? "azul" : "paper"}>
            {budgetStatusLabel(budget.status)}
          </Insignia>
          <span>
            {t("T-2310", {
              asignado: formatMoney(totals.assigned),
              gastado: formatMoney(totals.spent),
              disponible: formatMoney(totals.available),
            })}
          </span>
          {budget.submittedOn ? (
            <span className="text-tinta-suave">
              · {presentadoEl}: {civil(budget.submittedOn)}
            </span>
          ) : null}
        </p>
        {budget.notes ? (
          <p className="max-w-prose text-sm text-tinta-suave">{budget.notes}</p>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border-2 border-oe-orange px-4 py-2 text-sm">
          {error === "T-260" ? t("T-260") : error}
        </p>
      ) : null}
      {guardado ? (
        <output className="block rounded-xl border-2 border-borde px-4 py-2 text-sm">
          {t("T-2308")}
        </output>
      ) : null}

      <section aria-labelledby="rubros" className="flex flex-col gap-3">
        <h2 id="rubros" className="text-display-md">
          {tList("T-2190")[1]}
        </h2>
        <AdminTableRegion
          label={tList("T-2190")[1] ?? ""}
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
        {editable ? (
          <form action={setLinesAction} className="flex flex-col gap-3">
            <AdminFormBody>
              <input type="hidden" name="budgetId" value={budget.id} />
              <div className="grid gap-2">
                {rows.map((line, index) => (
                  <div key={line?.id ?? `nueva-${index}`} className="grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name={`line-${index}-id`} value={line?.id ?? ""} />
                    <label className="flex flex-col gap-1 text-xs" htmlFor={`line-${index}-name`}>
                      {nombre}
                      <input
                        id={`line-${index}-name`}
                        name={`line-${index}-name`}
                        defaultValue={line?.name ?? ""}
                        className={inputClass}
                      />
                    </label>
                    <label
                      className="flex flex-col gap-1 text-xs"
                      htmlFor={`line-${index}-assigned`}
                    >
                      {asignadoCampo}
                      <input
                        id={`line-${index}-assigned`}
                        name={`line-${index}-assigned`}
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={line ? String(line.assigned) : ""}
                        className={inputClass}
                      />
                    </label>
                    <label
                      className="flex flex-col gap-1 text-xs"
                      htmlFor={`line-${index}-sortOrder`}
                    >
                      {orden}
                      <input
                        id={`line-${index}-sortOrder`}
                        name={`line-${index}-sortOrder`}
                        type="number"
                        min={0}
                        defaultValue={line ? String(line.sortOrder) : String(index)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <AdminSubmitButton type="submit" className="boton-secundario self-start">
                {guardarRubros}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="aprobaciones" className="flex flex-col gap-3">
        <h2 id="aprobaciones" className="text-display-md">
          {aprobaciones}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2305")}</p>
        <p className="text-sm">
          {aprobDE}:{" "}
          {budget.studentDevelopmentApprovedOn ? civil(budget.studentDevelopmentApprovedOn) : "—"} ·{" "}
          {aprobVP}: {budget.vpFinanceApprovedOn ? civil(budget.vpFinanceApprovedOn) : "—"}
        </p>
        {editable ? (
          <div className="flex flex-wrap items-end gap-4">
            <form action={approveAction} className="flex flex-wrap items-end gap-3">
              <AdminFormBody>
                <input type="hidden" name="budgetId" value={budget.id} />
                <Campo id="aprobacion-approver" label={quienAprueba ?? ""}>
                  <select id="aprobacion-approver" name="approver" required className={inputClass}>
                    {APPROVERS.map((code) => (
                      <option key={code} value={code}>
                        {aprobadores[code] ?? code}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="aprobacion-on" label={fecha ?? ""}>
                  <input
                    id="aprobacion-on"
                    name="on"
                    type="date"
                    required
                    defaultValue={todayKey()}
                    className={inputClass}
                  />
                </Campo>
                <AdminSubmitButton type="submit" className="boton-secundario">
                  {registrarAprobacion}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
            {budget.status === "DRAFT" ? (
              <form action={openAction}>
                <AdminFormBody>
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <AdminSubmitButton type="submit" className="boton-primario">
                    {abrir}
                  </AdminSubmitButton>
                </AdminFormBody>
              </form>
            ) : (
              <form action={closeAction}>
                <AdminFormBody>
                  <input type="hidden" name="budgetId" value={budget.id} />
                  <AdminSubmitButton type="submit" className="boton-secundario">
                    {cerrar}
                  </AdminSubmitButton>
                </AdminFormBody>
              </form>
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="sancion" className="flex flex-col gap-3">
        <h2 id="sancion" className="text-display-md">
          {sancionTitulo}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2306")}</p>
        <p className="text-sm">
          {sancionCampo}: {budget.sanctionPercent} %
          {budget.sanctionReason ? ` · ${motivoSancion}: ${budget.sanctionReason}` : ""}
        </p>
        {editable ? (
          <form action={sanctionAction} className="flex flex-wrap items-end gap-3">
            <AdminFormBody>
              <input type="hidden" name="budgetId" value={budget.id} />
              <Campo id="sancion-percent" label={porcentaje ?? ""}>
                <input
                  id="sancion-percent"
                  name="percent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={String(budget.sanctionPercent || LATE_BUDGET_SANCTION_PERCENT)}
                  className={inputClass}
                />
              </Campo>
              <Campo id="sancion-reason" label={motivo ?? ""}>
                <input id="sancion-reason" name="reason" required className={inputClass} />
              </Campo>
              <AdminSubmitButton type="submit" className="boton-secundario">
                {aplicarSancion}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="presolicitudes" className="flex flex-col gap-3">
        <h2 id="presolicitudes" className="text-display-md">
          {presolicitudes}
        </h2>
        {prerequests.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinPresolicitudes}</p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm">
            {prerequests.map((item) => (
              <li key={item.id}>
                {item.month} · {civil(item.submittedOn)}
                {item.notes ? ` · ${item.notes}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="avales" className="flex flex-col gap-3">
        <h2 id="avales" className="text-display-md">
          {avales}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2301")}</p>
        {approvals.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinAvales}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0 text-sm">
            {approvals.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde p-3"
              >
                <p>
                  <span className="font-semibold">{item.title}</span> · {civil(item.eventOn)}{" "}
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
                  <span className="text-tinta-suave"> · {formatDateTime(item.requestedAt)}</span>
                </p>
                {item.description ? <p className="text-tinta-suave">{item.description}</p> : null}
                {item.decisionNote ? <p>{item.decisionNote}</p> : null}
                {item.status === "PENDING" ? (
                  <form action={decideApprovalAction} className="flex flex-wrap items-end gap-2">
                    <AdminFormBody>
                      <input type="hidden" name="budgetId" value={budget.id} />
                      <input type="hidden" name="approvalId" value={item.id} />
                      <Campo id={`nota-${item.id}`} label={notaDecision ?? ""}>
                        <input id={`nota-${item.id}`} name="note" className={inputClass} />
                      </Campo>
                      <AdminSubmitButton
                        type="submit"
                        name="decision"
                        value="APPROVED"
                        className="boton-primario"
                      >
                        {aprobar}
                      </AdminSubmitButton>
                      <AdminSubmitButton
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        className="boton-secundario"
                      >
                        {rechazar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="movimientos" className="flex flex-col gap-3">
        <h2 id="movimientos" className="text-display-md">
          {movimientos}
        </h2>
        {expenses.length === 0 && transfers.length === 0 ? (
          <p className="text-sm text-tinta-suave">{sinMovimientos}</p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm">
            {expenses.map((item) => (
              <li key={item.id}>
                {civil(item.spentOn)} · {item.lineName} · {formatMoney(item.amount)} ·{" "}
                {item.description}
                {item.supplier ? ` · ${item.supplier}` : ""}
                {item.approvalTitle ? ` · ${item.approvalTitle}` : ""}
              </li>
            ))}
            {transfers.map((item) => (
              <li key={item.id}>
                {formatDateTime(item.createdAt)} · {item.fromLineName} → {item.toLineName} ·{" "}
                {formatMoney(item.amount)} · {item.reason}
                {item.approvalTitle ? ` · ${item.approvalTitle}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
