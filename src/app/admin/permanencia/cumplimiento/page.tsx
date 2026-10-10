import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { DownloadNotice } from "@/app/admin/_kit/DownloadNotice";
import { exportLimitNotice } from "@/app/admin/_kit/export-limit-notice";
import { requireAdminActor } from "@/modules/identity";
import {
  COMPLIANCE_FILTERS,
  type ComplianceFilter,
  complianceSummary,
  listCompliance,
} from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { recomputeAction } from "./actions";

// Cumplimiento de permanencia para GH (12-permanencia): una fila por persona y comité desde los
// snapshots, filtros de GH, recálculo a pedido y export con step-up.

export const metadata: Metadata = { title: t("T-788") };

type Search = Record<string, string | string[] | undefined>;

const STATES = ["EN_CAMINO", "EN_RIESGO", "NO_ALCANZA", "CUMPLE", "PRUEBA", "NO_CUMPLE"];
const CONDITIONS = ["ACTIVE", "NEW", "PROBATION", "TRANSFER"];
const STATUSES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"];

export default async function CumplimientoPage({
  searchParams,
}: PageProps<"/admin/permanencia/cumplimiento">) {
  await requireAdminActor("/admin/permanencia/cumplimiento");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const filterParam = single(search.filtro);
  const filter: ComplianceFilter = COMPLIANCE_FILTERS.includes(filterParam as ComplianceFilter)
    ? (filterParam as ComplianceFilter)
    : "todos";
  const recalculando = single(search.recalculando) === "1";
  const filterLabels = tList("T-789");
  const columns = tList("T-790");
  const stateLabels = tList("T-791");
  const conditionLabels = tList("T-792");
  const statusLabels = tList("T-381");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-788")}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const [rows, summary] = await Promise.all([
    listCompliance(term.id, filter),
    complianceSummary(term.id),
  ]);
  const base = `/admin/permanencia/cumplimiento?termId=${term.id}`;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-788")}</h1>
          <p className="text-sm text-tinta-suave">
            {recalculando
              ? t("T-795")
              : summary.computedAt
                ? t("T-796", { fecha: formatDateTime(summary.computedAt) })
                : t("T-797")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            action="/admin/permanencia/cumplimiento"
            method="get"
            className="flex items-center gap-2 text-sm"
          >
            <label htmlFor="termId" className="eyebrow text-xs">
              {tList("T-570")[0]}
            </label>
            <select
              id="termId"
              name="termId"
              defaultValue={term.id}
              className="rounded-xl border-2 border-borde bg-fondo px-3 py-1"
            >
              {terms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
            <AdminSubmitButton type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
              {t("T-250")}
            </AdminSubmitButton>
          </form>
          <form action={recomputeAction}>
            <AdminFormBody>
              <input type="hidden" name="termId" value={term.id} />
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-8 px-3 py-1 text-sm"
              >
                {t("T-794")}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
          <a
            href={`/api/export/permanencia?termId=${term.id}&filtro=${filter}`}
            className="boton-secundario min-h-8 px-3 py-1 text-sm"
          >
            {t("T-255")}
          </a>
        </div>
      </header>

      <DownloadNotice searchParams={search} />
      {exportLimitNotice(rows.length)}
      <nav aria-label={filterLabels[0] ?? ""} className="flex flex-wrap gap-2">
        {COMPLIANCE_FILTERS.map((key, index) => (
          <Link
            key={key}
            href={`${base}&filtro=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold no-underline ${filter === key ? "bg-oe-navy text-oe-paper" : "bg-fondo-suave text-titulo"}`}
          >
            {filterLabels[index] ?? key}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-797")}</p>
      ) : (
        <AdminTableRegion label={t("T-788")} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {columns.map((column) => (
                  <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-borde border-t">
                  <td className="py-2 pr-3 font-semibold">
                    <Link
                      href={`/admin/personas/${row.personId}?pestana=permanencia`}
                      className="underline"
                    >
                      {row.personName}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {row.condition
                      ? (conditionLabels[CONDITIONS.indexOf(row.condition)] ?? "")
                      : t("T-793", {
                          estado: statusLabels[STATUSES.indexOf(row.status)] ?? row.status,
                        })}
                  </td>
                  <td className="py-2 pr-3">{row.committeeName}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.generalTotal}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.committeeTotal}</td>
                  <td className="py-2 pr-3 font-semibold tabular-nums">{row.total}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.threshold || ""}</td>
                  <td className="py-2 pr-3">
                    {row.state ? (
                      <Insignia
                        fondo={
                          row.state === "NO_ALCANZA" || row.state === "NO_CUMPLE"
                            ? "naranja"
                            : row.state === "EN_RIESGO" || row.state === "PRUEBA"
                              ? "amarillo"
                              : "sky"
                        }
                      >
                        {stateLabels[STATES.indexOf(row.state)] ?? row.state}
                      </Insignia>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.state ? `${row.mandatoryAttended} / ${row.mandatoryTotal}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableRegion>
      )}
    </div>
  );
}
