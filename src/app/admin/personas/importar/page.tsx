import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminActor } from "@/modules/identity";
import {
  getRosterPreview,
  HEADER_ALIASES,
  type PreviewRow,
  ROSTER_COLUMNS,
  type RosterPreview,
} from "@/modules/people";
import { statusLabel } from "@/modules/people/admin";
import { RosterUploader } from "@/modules/people/components/RosterUploader";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { BarraTitulo, Insignia, Numeral } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { applyAction, discardAction, remapAction } from "./actions";

// Asistente de importación del roster (13-importacion-del-roster.md, ADR-034): archivo y semestre,
// columnas, revisión y confirmación con step-up.

const [, importar] = tList("T-509");

export const metadata: Metadata = { title: importar ?? "" };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

function columnLabel(column: string): string {
  return HEADER_ALIASES[column as (typeof ROSTER_COLUMNS)[number]]?.[0] ?? column;
}

function Mapeo({ preview }: { preview: RosterPreview }) {
  const [, continuar] = tList("T-479") as [string, string, string, string];
  return (
    <form action={remapAction} className="flex flex-col gap-4">
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
      <button type="submit" className="boton-secundario self-start">
        {continuar}
      </button>
    </form>
  );
}

function committeesText(row: PreviewRow): string {
  return (row.committees ?? [])
    .map((item) => `${item.name} · ${item.newRoleLabel ?? item.roleCode}`)
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
        <table className="w-full text-left text-sm">
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
                <td className="px-3 py-2 text-tinta-suave">{t("T-491", { n: row.row })}</td>
                <td className="px-3 py-2 font-semibold">
                  {[row.firstName ?? row.values.firstName, row.lastName ?? row.values.lastName]
                    .filter(Boolean)
                    .join(" ")}
                </td>
                <td className="px-3 py-2">{row.email ?? row.values.email}</td>
                <td className="px-3 py-2">{committeesText(row) || row.values.committees}</td>
                <td className="px-3 py-2">
                  {row.status ? statusLabel(row.status) : row.values.status}
                  {row.probation ? ` · ${t("T-449")}` : ""}
                </td>
                <td className="px-3 py-2">
                  {showChanges ? (
                    row.changes.map(columnLabel).join(", ")
                  ) : (
                    <ul className="list-none p-0">
                      {row.errors.map((error) => (
                        <li key={error} className="font-semibold text-oe-navy">
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

function Revision({ preview, error }: { preview: RosterPreview; error: string }) {
  const grupos = tList("T-482");
  const [, , aplicar, descartar] = tList("T-479") as [string, string, string, string];
  const byGroup = (group: PreviewRow["group"]) => preview.rows.filter((row) => row.group === group);
  const canApply = preview.rows.some((row) => row.group === "NEW" || row.group === "CHANGED");
  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <Mapeo preview={preview} />
      <div className="flex flex-col gap-2 text-sm">
        {preview.updateMode ? <p>{t("T-489")}</p> : null}
        {preview.missingRequired.includes("email") ? (
          <p role="alert" className="font-semibold">
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
      <p className="text-lg font-semibold">
        {t("T-166", {
          n: preview.counts.NEW,
          m: preview.counts.CHANGED,
          k: preview.counts.UNCHANGED,
        })}
      </p>
      <Grupo titulo={grupos[3] ?? ""} rows={byGroup("ERROR")} showChanges={false} />
      <Grupo titulo={grupos[0] ?? ""} rows={byGroup("NEW")} showChanges />
      <Grupo titulo={grupos[1] ?? ""} rows={byGroup("CHANGED")} showChanges />
      <Grupo titulo={grupos[2] ?? ""} rows={byGroup("UNCHANGED")} showChanges />
      <form action={applyAction} className="flex flex-col gap-4">
        <input type="hidden" name="jobId" value={preview.jobId} />
        {preview.proposals.length > 0 ? (
          <fieldset className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde p-4">
            <legend className="eyebrow px-1 text-xs">{t("T-484")}</legend>
            {preview.proposals.map((proposal) => {
              const id = `proposal-${proposal.email}-${proposal.committeeId}`;
              return (
                <label key={id} htmlFor={id} className="flex items-center gap-3 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    name="proposal"
                    value={`${proposal.email}|${proposal.committeeId}`}
                    defaultChecked
                    className="size-5 accent-oe-navy"
                  />
                  <span>
                    {proposal.personName} ·{" "}
                    {t("T-370", { cargo: "General", comité: proposal.committeeName })}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {canApply ? (
            <button type="submit" className="boton-calido">
              {aplicar}
            </button>
          ) : null}
          <button type="submit" formAction={discardAction} className="boton-secundario">
            {descartar}
          </button>
        </div>
      </form>
    </div>
  );
}

function Aplicada({ preview }: { preview: RosterPreview }) {
  const summary = preview.summary as {
    created?: number;
    updated?: number;
    skipped?: number;
    leaders?: { granted?: string[]; failed?: string[] };
  };
  const [personas] = tList("T-420") as [string, string];
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
  await requireAdminActor("/admin/personas/importar");
  const params: Search = await searchParams;
  const jobId = single(params.job);
  const error = single(params.error);
  const pasos = tList("T-475");
  const [subir] = tList("T-479") as [string, string, string, string];
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
        }}
      />
    );
  } else {
    const preview = await getRosterPreview(jobId);
    if (!preview) {
      notFound();
    }
    step = preview.status === "PREVIEW" ? 2 : 3;
    content =
      preview.status === "APPLIED" ? (
        <Aplicada preview={preview} />
      ) : preview.status === "PREVIEW" ? (
        <Revision preview={preview} error={error} />
      ) : (
        <p className="text-tinta-suave">{estados[2]}</p>
      );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{importar}</h1>
      <ol className="flex list-none flex-wrap gap-2 p-0">
        {pasos.map((paso, index) => (
          <li key={paso}>
            <Insignia fondo={index === step ? "amarillo" : "sky"}>{paso}</Insignia>
          </li>
        ))}
      </ol>
      <BarraTitulo color="azul" className="self-start">
        {pasos[step] ?? ""}
      </BarraTitulo>
      {content}
    </div>
  );
}
