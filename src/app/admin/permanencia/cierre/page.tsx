import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  CLOSING_FILTERS,
  type ClosingFilter,
  type ClosingPersonRow,
  COMPLIANCE_STATES,
  filterClosingRows,
  listClosingRows,
} from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { applyAction, confirmAction, confirmAllAction } from "./actions";

// Cierre de permanencia para GH (ADR-027, ADR-036 regla 9): propuestas derivadas del snapshot,
// confirmación por persona (cambiar exige motivo), en bloque y aplicación con step-up.

export const metadata: Metadata = { title: t("T-798") };

type Search = Record<string, string | string[] | undefined>;

const DECISIONS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE", "EXIT_OE"] as const;
const COMMITTEE_DECISIONS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE"] as const;
const PERSON_DECISIONS = ["CONTINUES", "EXIT_OE"] as const;

const selectClass = "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta";

export default async function CierrePermanenciaPage({
  searchParams,
}: PageProps<"/admin/permanencia/cierre">) {
  const actor = await requireAdminActor("/admin/permanencia/cierre");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const filterParam = single(search.filtro);
  const filter: ClosingFilter = CLOSING_FILTERS.includes(filterParam as ClosingFilter)
    ? (filterParam as ClosingFilter)
    : "ALL";
  const accion = single(search.accion);
  const persona = single(search.persona);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const aplicado = single(search.aplicado) === "1";
  const bloque = single(search.bloque);
  const summaryLabels = tList("T-800");
  const reasonLabels = tList("T-801");
  const decisionLabels: Readonly<Record<string, string>> = tLabels("T-802", DECISIONS);
  const [confirmar, cambiar, confirmarTodas, aplicar] = tList("T-803");
  const [campoDecision, campoMotivo] = tList("T-804");
  const filterLabels = tList("T-816");
  const filterNames = tLabels("T-816", CLOSING_FILTERS);
  const stateLabels = tLabels("T-791", COMPLIANCE_STATES);
  const conditionLabels = tList("T-792");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-798")}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const base = `/admin/permanencia/cierre?termId=${term.id}`;
  const withFilter = filter === "ALL" ? base : `${base}&filtro=${filter}`;
  const closable = Boolean(term.pointsClosedAt) && !term.permanenceClosedAt;
  if ((accion === "bloque" || accion === "aplicar") && closable && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${base}&accion=${accion}`)}`);
  }
  const { rows, summary } = await listClosingRows(term.id);
  const visible = filterClosingRows(rows, filter);
  const editing = persona ? rows.find((row) => row.personId === persona) : undefined;
  const decisionLabel = (kind: string) => decisionLabels[kind] ?? kind;
  const cards: Array<[string, number]> = [
    [summaryLabels[0] ?? "", summary.people],
    [summaryLabels[1] ?? "", summary.continues],
    [summaryLabels[2] ?? "", summary.probation],
    [summaryLabels[3] ?? "", summary.exitCommittee],
    [summaryLabels[4] ?? "", summary.exitOe],
    [summaryLabels[5] ?? "", summary.undecided],
    [summaryLabels[6] ?? "", summary.pendingEvaluations],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-798")}</h1>
          <p className="text-sm text-tinta-suave">{t("T-644", { término: term.code })}</p>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
          ) : null}
          {bloque ? (
            <output className="block font-semibold text-oe-blue">
              {t("T-812", { n: bloque })}
            </output>
          ) : null}
          {aplicado ? (
            <output className="block font-semibold text-oe-blue">{t("T-811")}</output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <ActionForm
          action="/admin/permanencia/cierre"
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
        </ActionForm>
      </header>

      {term.permanenceClosedAt ? (
        <div className="flex flex-col gap-2 rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">
          <p className="font-semibold">
            {t("T-808", { término: term.code, fecha: formatDateTime(term.permanenceClosedAt) })}
          </p>
          <p>{t("T-810", { n: summary.applied, m: summary.toApply })}</p>
        </div>
      ) : !term.pointsClosedAt ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">
          {t("T-799", { término: term.code })}{" "}
          <Link href={`/admin/cierre?termId=${term.id}`} className="underline">
            {tList("T-561")[4]}
          </Link>
        </p>
      ) : null}

      {summary.pendingEvaluations > 0 && !term.permanenceClosedAt ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3 font-semibold">
          {t("T-813", { n: summary.pendingEvaluations })}
        </p>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <dt className="eyebrow text-xs">{label}</dt>
            <dd className="font-display text-display-lg leading-none">{value}</dd>
          </div>
        ))}
      </dl>

      {closable ? (
        <div className="flex flex-wrap items-center gap-3">
          {summary.undecided > 0 ? (
            <Link href={`${base}&accion=bloque`} className="boton-secundario">
              {confirmarTodas}
            </Link>
          ) : null}
          {rows.length > 0 ? (
            <Link href={`${base}&accion=aplicar`} className="boton-calido">
              {aplicar}
            </Link>
          ) : null}
        </div>
      ) : null}

      <nav aria-label={filterLabels[0] ?? ""} className="flex flex-wrap gap-2">
        {CLOSING_FILTERS.map((key) => (
          <Link
            key={key}
            href={key === "ALL" ? base : `${base}&filtro=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold no-underline ${filter === key ? "bg-oe-navy text-oe-paper" : "bg-fondo-suave text-titulo"}`}
          >
            {filterNames[key] ?? key}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-814", { término: term.code })}</p>
      ) : visible.length === 0 ? (
        <p className="text-tinta-suave">{t("T-256")}</p>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {visible.map((row) => (
            <li
              key={row.personId}
              className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/personas/${row.personId}?pestana=permanencia`}
                    className="font-semibold underline"
                  >
                    {row.name}
                  </Link>
                  {row.isNew ? <Insignia fondo="sky">{conditionLabels[1]}</Insignia> : null}
                  {row.probation ? (
                    <Insignia fondo="amarillo">{conditionLabels[2]}</Insignia>
                  ) : null}
                  {row.pendingEvaluations > 0 ? (
                    <Insignia fondo="paper">
                      {summaryLabels[6]}: {row.pendingEvaluations}
                    </Insignia>
                  ) : null}
                </div>
                <Insignia
                  fondo={row.effective === "EXIT_OE" ? "naranja" : "sky"}
                  className="normal-case"
                >
                  {decisionLabel(row.effective)}
                </Insignia>
              </div>
              <ul className="flex list-none flex-col gap-1 p-0 text-sm">
                {row.committees.map((committee) => {
                  const decided = committee.decision?.decision ?? committee.proposed;
                  return (
                    <li
                      key={committee.committeeId}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        <span className="font-semibold">{committee.committeeName}</span>{" "}
                        <span className="tabular-nums text-tinta-suave">
                          {committee.total} / {committee.threshold}
                        </span>{" "}
                        <span className="text-tinta-suave">
                          {stateLabels[committee.finalState] ?? ""}
                        </span>
                      </span>
                      <span className="font-semibold">{decisionLabel(decided)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-sm text-tinta-suave">
                {t("T-164", {
                  estado: decisionLabel(row.personProposed),
                  detalle: reasonLabels[row.personReason] ?? "",
                })}
              </p>
              {row.personDecision ? (
                <p className="text-sm">
                  {t("T-817", {
                    quien: row.decidedByName,
                    fecha: formatDateTime(row.personDecision.decidedAt),
                  })}
                  {row.personDecision.reason ? ` · ${row.personDecision.reason}` : ""}
                </p>
              ) : null}
              {row.drifted ? (
                <p className="text-sm font-semibold text-oe-orange">
                  {t("T-806", { propuesta: decisionLabel(row.personProposed) })}
                </p>
              ) : null}
              {closable ? (
                <div className="flex flex-wrap items-center gap-2">
                  {!row.decided ? (
                    <ActionForm action={confirmAction}>
                      <AdminFormBody>
                        <input type="hidden" name="termId" value={term.id} />
                        <input type="hidden" name="filtro" value={filter === "ALL" ? "" : filter} />
                        <input type="hidden" name="personId" value={row.personId} />
                        <input type="hidden" name="persona" value={row.personProposed} />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-calido min-h-9 px-4 py-1 text-sm"
                        >
                          {confirmar}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  ) : null}
                  <Link
                    href={`${withFilter}&persona=${row.personId}`}
                    className="boton-secundario min-h-9 px-4 py-1 text-sm"
                  >
                    {cambiar}
                  </Link>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editing && closable ? (
        <PanelCambio
          row={editing}
          termId={term.id}
          filter={filter}
          closeHref={withFilter}
          labels={{
            title: `${cambiar} · ${editing.name}`,
            decision: campoDecision ?? "",
            reason: campoMotivo ?? "",
            save: confirmar ?? "",
            decisionLabel,
          }}
        />
      ) : null}

      {accion === "bloque" && closable ? (
        <ResourcePanel title={confirmarTodas ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <ActionForm action={confirmAllAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="termId" value={term.id} />
              <p>{t("T-807", { n: summary.undecided })}</p>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {confirmarTodas}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </ActionForm>
        </ResourcePanel>
      ) : null}

      {accion === "aplicar" && closable ? (
        <ResourcePanel title={aplicar ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <ActionForm action={applyAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="termId" value={term.id} />
              <p>
                {t("T-809", {
                  término: term.code,
                  salen: summary.exitOe,
                  comites: summary.exitCommittee,
                  prueba: summary.probation,
                })}
              </p>
              {summary.undecided > 0 ? (
                <p className="font-semibold text-oe-orange">
                  {t("T-807", { n: summary.undecided })}
                </p>
              ) : null}
              {summary.pendingEvaluations > 0 ? (
                <p>{t("T-813", { n: summary.pendingEvaluations })}</p>
              ) : null}
              <div className="flex items-center gap-3">
                <AdminSubmitButton
                  type="submit"
                  className="boton-calido"
                  disabled={summary.undecided > 0}
                >
                  {aplicar}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </ActionForm>
        </ResourcePanel>
      ) : null}
    </div>
  );
}

function PanelCambio({
  row,
  termId,
  filter,
  closeHref,
  labels,
}: {
  row: ClosingPersonRow;
  termId: string;
  filter: ClosingFilter;
  closeHref: string;
  labels: {
    title: string;
    decision: string;
    reason: string;
    save: string;
    decisionLabel: (kind: string) => string;
  };
}) {
  return (
    <ResourcePanel title={labels.title} closeHref={closeHref} closeLabel={t("T-291")}>
      <ActionForm action={confirmAction} className="flex flex-col gap-4">
        <AdminFormBody>
          <input type="hidden" name="termId" value={termId} />
          <input type="hidden" name="filtro" value={filter === "ALL" ? "" : filter} />
          <input type="hidden" name="personId" value={row.personId} />
          <input type="hidden" name="cambiar" value="1" />
          {row.committees.map((committee) => {
            const id = `comite-${committee.committeeId}`;
            return (
              <div key={committee.committeeId} className="flex flex-col gap-1">
                <label htmlFor={id} className="eyebrow text-xs">
                  {labels.decision} · {committee.committeeName}
                </label>
                <select
                  id={id}
                  name={`comite:${committee.committeeId}`}
                  defaultValue={committee.decision?.decision ?? committee.proposed}
                  className={selectClass}
                >
                  {COMMITTEE_DECISIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {labels.decisionLabel(kind)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          <div className="flex flex-col gap-1">
            <label htmlFor="persona" className="eyebrow text-xs">
              {labels.decision} · {row.name}
            </label>
            <select
              id="persona"
              name="persona"
              defaultValue={row.effective}
              className={selectClass}
            >
              {PERSON_DECISIONS.map((kind) => (
                <option key={kind} value={kind}>
                  {labels.decisionLabel(kind)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="reason" className="eyebrow text-xs">
              {labels.reason}
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              defaultValue={row.personDecision?.reason ?? ""}
              className={selectClass}
            />
            <p className="text-xs text-tinta-suave">{t("T-805")}</p>
          </div>
          <div className="flex items-center gap-3">
            <AdminSubmitButton type="submit" className="boton-calido">
              {labels.save}
            </AdminSubmitButton>
            <Link href={closeHref} className="boton-secundario">
              {t("T-254")}
            </Link>
          </div>
        </AdminFormBody>
      </ActionForm>
    </ResourcePanel>
  );
}
