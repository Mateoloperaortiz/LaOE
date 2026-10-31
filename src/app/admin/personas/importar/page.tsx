import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  committeeRolesLabel,
  getRosterPreview,
  HEADER_ALIASES,
  type PreviewRow,
  ROSTER_COLUMNS,
  type RosterPreview,
} from "@/modules/people";
import { statusLabel } from "@/modules/people/admin";
import { RosterUploader } from "@/modules/people/components/RosterUploader";
import { getPrivacyPolicyState } from "@/modules/system";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia, Numeral } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { applyAction, discardAction, remapAction } from "./actions";
import { parseProposalIndexes, proposalSelectionVersion } from "./selection";

// Asistente de importación del roster (13-importacion-del-roster.md, ADR-034): archivo y semestre,
// columnas, revisión y confirmación con step-up.

const [, importar] = tList("T-509");

export const metadata: Metadata = { title: importar ?? "" };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "min-w-0 w-full rounded-xl border border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

function columnLabel(column: string): string {
  return HEADER_ALIASES[column as (typeof ROSTER_COLUMNS)[number]]?.[0] ?? column;
}

function Mapeo({ preview }: { preview: RosterPreview }) {
  return (
    <ActionForm action={remapAction} className="flex flex-col gap-4">
      <AdminFormBody>
        <input type="hidden" name="jobId" value={preview.jobId} />
        <input type="hidden" name="columns" value={preview.headers.length} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {preview.headers.map((header, index) => {
            const id = `col_${index}`;
            return (
              <div key={id} className="flex flex-col gap-1">
                <label htmlFor={id} className="eyebrow text-xs">
                  {t("T-480", { cabecera: header })}
                </label>
                <select
                  id={id}
                  name={id}
                  defaultValue={preview.mapping[index] ?? ""}
                  className={inputClass}
                >
                  <option value="">{t("T-481")}</option>
                  {ROSTER_COLUMNS.map((column) => (
                    <option key={column} value={column}>
                      {columnLabel(column)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <AdminSubmitButton className="boton-primario self-start">{t("T-1475")}</AdminSubmitButton>
      </AdminFormBody>
    </ActionForm>
  );
}

function committeesText(row: PreviewRow): string {
  return (row.committees ?? [])
    .map((item) => {
      const cargos =
        item.roles.length > 0
          ? committeeRolesLabel(
              item.roles.map((role) => ({
                roleCode: role.roleCode,
                roleLabel: role.newLabel ?? role.roleCode,
                coDirector: role.coDirector,
              })),
              item.roleCode,
            )
          : (item.newRoleLabel ?? item.roleCode);
      return `${item.name} · ${cargos}`;
    })
    .join(", ");
}

function Grupo({
  titulo,
  rows,
  showChanges,
}: {
  titulo: string;
  rows: PreviewRow[];
  showChanges: boolean;
}) {
  const campos = tList("T-427");
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-3 text-display-md">
        <Numeral valor={rows.length} className="text-2xl" />
        {titulo}
      </h3>
      <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
        <table className="admin-data-table w-full text-left text-sm">
          <thead className="eyebrow bg-fondo-suave text-xs">
            <tr>
              <th scope="col" className="px-3 py-2">
                #
              </th>
              <th scope="col" className="px-3 py-2">
                {campos[0]}
              </th>
              <th scope="col" className="px-3 py-2">
                {campos[2]}
              </th>
              <th scope="col" className="px-3 py-2">
                {t("T-431")}
              </th>
              <th scope="col" className="px-3 py-2">
                {campos[9]}
              </th>
              <th scope="col" className="px-3 py-2">
                {showChanges ? t("T-482").split("·")[1]?.trim() : t("T-260")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.row} className="border-t border-borde align-top">
                <td data-label="#" className="px-3 py-2 text-tinta-suave">
                  {t("T-491", { n: row.row })}
                </td>
                <td data-label={campos[0]} className="px-3 py-2 font-semibold">
                  {[row.firstName ?? row.values.firstName, row.lastName ?? row.values.lastName]
                    .filter(Boolean)
                    .join(" ")}
                </td>
                <td data-label={campos[2]} className="px-3 py-2">
                  {row.email ?? row.values.email}
                </td>
                <td data-label={t("T-431")} className="px-3 py-2">
                  {committeesText(row) || row.values.committees}
                </td>
                <td data-label={campos[9]} className="px-3 py-2">
                  {row.status ? statusLabel(row.status) : row.values.status}
                  {row.probation ? ` · ${t("T-449")}` : ""}
                </td>
                <td data-label={showChanges ? tList("T-482")[1] : t("T-260")} className="px-3 py-2">
                  {showChanges ? (
                    row.changes.map(columnLabel).join(", ")
                  ) : (
                    <ul className="list-none p-0">
                      {row.errors.map((error) => (
                        <li key={error} className="font-semibold text-titulo">
                          {error}
                        </li>
                      ))}
                    </ul>
                  )}
                  {row.warnings.length > 0 ? (
                    <ul className="list-none p-0 text-xs text-tinta-suave">
                      {row.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Resumen({ preview }: { preview: RosterPreview }) {
  return (
    <div className="admin-surface flex flex-col gap-2 rounded-xl border border-borde bg-fondo-suave p-4">
      <h3 className="text-sm font-semibold">{t("T-1483")}</h3>
      <p className="font-semibold">
        {t("T-166", {
          n: preview.counts.NEW,
          m: preview.counts.CHANGED,
          k: preview.counts.UNCHANGED,
        })}
      </p>
      <p className="text-sm text-tinta-suave">{t("T-1484", { n: preview.counts.ERROR })}</p>
    </div>
  );
}

function Revision({ preview }: { preview: RosterPreview }) {
  const grupos = tList("T-482");
  const byGroup = (group: PreviewRow["group"]) => preview.rows.filter((row) => row.group === group);
  const canApply = preview.rows.some((row) => row.group === "NEW" || row.group === "CHANGED");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Resumen preview={preview} />
      <div className="flex flex-col gap-2 text-sm">
        {preview.updateMode ? <p>{t("T-489")}</p> : null}
        {preview.missingRequired.includes("email") ? (
          <p role="alert">
            {t("T-490", { lista: preview.missingRequired.map(columnLabel).join(", ") })}
          </p>
        ) : null}
        {preview.missingTerms.length > 0 ? (
          <p>{t("T-485", { lista: preview.missingTerms.join(", ") })}</p>
        ) : null}
        {preview.unknownRoles.length > 0 ? (
          <p>{t("T-486", { lista: preview.unknownRoles.join(", ") })}</p>
        ) : null}
      </div>
      <Grupo titulo={grupos[3] ?? ""} rows={byGroup("ERROR")} showChanges={false} />
      <Grupo titulo={grupos[0] ?? ""} rows={byGroup("NEW")} showChanges />
      <Grupo titulo={grupos[1] ?? ""} rows={byGroup("CHANGED")} showChanges />
      <Grupo titulo={grupos[2] ?? ""} rows={byGroup("UNCHANGED")} showChanges />
      {!canApply ? <p className="text-sm text-tinta-suave">{t("T-1482")}</p> : null}
      <div className="flex flex-wrap gap-3">
        {canApply ? (
          <Link href={jobHref(preview.jobId, "confirmacion")} className="boton-primario">
            {t("T-1476")}
          </Link>
        ) : null}
        <Link href={jobHref(preview.jobId, "columnas")} className="boton-secundario">
          {t("T-1477")}
        </Link>
        <ActionForm action={discardAction}>
          <AdminFormBody>
            <input type="hidden" name="jobId" value={preview.jobId} />
            <AdminSubmitButton className="boton-secundario">{tList("T-479")[3]}</AdminSubmitButton>
          </AdminFormBody>
        </ActionForm>
      </div>
    </div>
  );
}

function Confirmacion({
  preview,
  policyReady,
  selectedIndexes,
}: {
  preview: RosterPreview;
  policyReady: boolean;
  selectedIndexes: number[];
}) {
  const [, , aplicar, descartar] = tList("T-479");
  const canApply = preview.rows.some((row) => row.group === "NEW" || row.group === "CHANGED");
  return (
    <div className="flex flex-col gap-5">
      <Resumen preview={preview} />
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-1479")}</p>
      <ActionForm action={applyAction} className="flex flex-col gap-4">
        <AdminFormBody>
          <input
            type="hidden"
            name="proposalVersion"
            value={proposalSelectionVersion(preview.proposals)}
          />
          <input type="hidden" name="jobId" value={preview.jobId} />
          {preview.proposals.length > 0 ? (
            <fieldset className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde p-4">
              <legend className="eyebrow px-1 text-xs">{t("T-484")}</legend>
              {preview.proposals.map((proposal, index) => {
                const id = `proposal-${proposal.email}-${proposal.committeeId}`;
                return (
                  <label key={id} htmlFor={id} className="flex items-center gap-3 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      name="proposal"
                      value={String(index)}
                      defaultChecked={selectedIndexes.includes(index)}
                      className="size-5 accent-oe-navy"
                    />
                    <span>
                      {proposal.personName} ·{" "}
                      {t("T-370", {
                        cargo: proposal.coDirector ? t("T-2144", { cargo: "General" }) : "General",
                        comité: proposal.committeeName,
                      })}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {canApply ? (
              <AdminSubmitButton className="boton-primario" disabled={!policyReady}>
                {aplicar}
              </AdminSubmitButton>
            ) : null}
            <AdminSubmitButton formAction={discardAction} className="boton-secundario">
              {descartar}
            </AdminSubmitButton>
          </div>
        </AdminFormBody>
      </ActionForm>
      <Link href={jobHref(preview.jobId, "revision")} className="self-start text-sm underline">
        {t("T-1478")}
      </Link>
    </div>
  );
}

function jobHref(jobId: string, step: string) {
  return `/admin/personas/importar?${new URLSearchParams({ job: jobId, paso: step })}`;
}

function Aplicada({ preview }: { preview: RosterPreview }) {
  const summary = preview.summary as {
    created?: number;
    updated?: number;
    skipped?: number;
    leaders?: { granted?: string[]; failed?: string[] };
  };
  const [personas] = tList("T-420");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold">
        {t("T-487", { n: summary.created ?? 0, m: summary.updated ?? 0 })}
      </p>
      {summary.leaders?.granted?.length ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {summary.leaders.granted.map((item) => (
            <li key={item}>
              <Insignia fondo="amarillo">{item}</Insignia>
            </li>
          ))}
        </ul>
      ) : null}
      {summary.leaders?.failed?.length ? (
        <ul className="list-none p-0 text-sm">
          {summary.leaders.failed.map((item) => (
            <li key={item} className="rounded-lg bg-oe-orange px-2 py-1 text-oe-navy">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      <Link href="/admin/personas" className="boton-secundario self-start">
        {personas}
      </Link>
    </div>
  );
}

export default async function ImportarPage({
  searchParams,
}: PageProps<"/admin/personas/importar">) {
  const actor = await requireAdminActor("/admin/personas/importar");
  const params: Search = await searchParams;
  const jobId = single(params.job);
  let error = single(params.error);
  const policy = await getPrivacyPolicyState();
  const pasos = tList("T-1487");
  const [subir] = tList("T-479");
  const [, , , estados] = [null, null, null, tList("T-493")];

  let content: React.ReactNode;
  let step = 0;
  if (!jobId) {
    const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
    content = (
      <RosterUploader
        endpoint="/api/admin/importaciones/roster"
        terms={terms.map((term) => ({ id: term.id, code: term.code }))}
        defaultTermId={current?.id ?? terms[0]?.id ?? ""}
        labels={{
          file: t("T-476"),
          term: t("T-477"),
          help: t("T-478"),
          button: subir,
          uploading: t("T-359"),
          error: t("T-488"),
          chooseFile: t("T-1485"),
          noFile: t("T-1486"),
          replaceFile: t("T-1488"),
          removeFile: t("T-1489"),
        }}
      />
    );
  } else {
    const preview = await getRosterPreview(jobId);
    if (!preview) {
      notFound();
    }
    const requestedStep = single(params.paso);
    step =
      preview.status === "PREVIEW"
        ? requestedStep === "confirmacion"
          ? 3
          : requestedStep === "revision"
            ? 2
            : 1
        : 3;
    const version = proposalSelectionVersion(preview.proposals);
    const hasSelection = params.seleccion !== undefined;
    const selectionMatches = single(params.revision) === version;
    const selectedIndexes = hasSelection
      ? selectionMatches
        ? parseProposalIndexes(single(params.seleccion))
        : []
      : preview.proposals.map((_, index) => index);
    if (hasSelection && !selectionMatches) error = t("T-1490");
    if (preview.status === "PREVIEW" && step === 3 && !hasRecentStepUp(actor)) {
      const returnParams = new URLSearchParams({ job: preview.jobId, paso: "confirmacion" });
      if (hasSelection) {
        returnParams.set("seleccion", selectedIndexes.join(","));
        returnParams.set("revision", version);
      }
      redirect(
        `/ingresar/paso?next=${encodeURIComponent(`/admin/personas/importar?${returnParams}`)}`,
      );
    }
    content =
      preview.status === "APPLIED" ? (
        <Aplicada preview={preview} />
      ) : preview.status === "PREVIEW" ? (
        step === 1 ? (
          <Mapeo preview={preview} />
        ) : step === 2 ? (
          <Revision preview={preview} />
        ) : (
          <Confirmacion
            preview={preview}
            policyReady={policy.ready}
            selectedIndexes={selectedIndexes}
          />
        )
      ) : (
        <p className="text-tinta-suave">{estados[2]}</p>
      );
  }

  return (
    <div className="admin-page flex min-w-0 flex-col gap-6">
      <header className="admin-page-header">
        <h1 className="text-display-lg">{importar}</h1>
        <p className="mt-2 max-w-prose text-sm text-tinta-suave">{t("T-1480")}</p>
      </header>
      {!policy.ready ? <PrivacyPolicyNotice admin /> : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-3 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <ol className="admin-stepper grid list-none grid-cols-2 gap-2 p-0 lg:grid-cols-4">
        {pasos.map((paso, index) => (
          <li
            key={paso}
            aria-current={index === step ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${index === step ? "border-titulo bg-fondo-suave font-semibold text-titulo" : "border-borde text-tinta-suave"}`}
          >
            <span className="font-semibold tabular-nums">{index + 1}</span>
            {paso}
          </li>
        ))}
      </ol>
      <h2 className="text-titulo-md">{pasos[step] ?? ""}</h2>
      {content}
    </div>
  );
}
