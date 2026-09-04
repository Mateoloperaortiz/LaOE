import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { ASSEMBLY_KINDS, assemblyOverview, listTermAssemblies } from "@/modules/participation";
import { occasionStatusCell } from "@/modules/participation/admin";
import { getPeopleByIds } from "@/modules/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { adjustRequirementAction } from "./actions";

// Asambleas del término para GH (ADR-024, ADR-028, ADR-035 regla 12): las asambleas, el cumplimiento
// por persona y el ajuste individual del requisito con motivo.

export const metadata: Metadata = { title: tList("T-665")[0] ?? "" };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const FILTERS = ["todos", "cumplen", "no-cumplen", "ajustados"] as const;
type Filter = (typeof FILTERS)[number];
const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function AsambleasPage({ searchParams }: PageProps<"/admin/asambleas">) {
  await requireAdminActor("/admin/asambleas");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const filterParam = single(search.filtro);
  const filter: Filter = FILTERS.includes(filterParam as Filter)
    ? (filterParam as Filter)
    : "todos";
  const accion = single(search.accion);
  const personId = single(search.personId);
  const error = single(search.error);
  const guardado = single(search.guardado);
  const kindLabels = tList("T-546");
  const columns = tList("T-638");
  const filterLabels = tList("T-639");
  const [tituloAjuste, campoOrdinarias, campoEleccion, campoSegunda, campoMotivo] = tList("T-640");
  const [si, no, cumple, noCumple, ajustado] = tList("T-642");

  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-637", { término: "" })}</h1>
        <p className="text-tinta-suave">{t("T-548")}</p>
      </div>
    );
  }
  const [assemblies, overview] = await Promise.all([
    listTermAssemblies(term.id),
    assemblyOverview(term),
  ]);
  const rows = overview.filter((row) =>
    filter === "cumplen"
      ? row.compliance.compliant
      : filter === "no-cumplen"
        ? !row.compliance.compliant
        : filter === "ajustados"
          ? row.requirement.adjusted
          : true,
  );
  const base = `/admin/asambleas?termId=${term.id}`;
  const target = personId ? overview.find((row) => row.personId === personId) : undefined;
  const people = guardado ? await getPeopleByIds([guardado]) : new Map();
  const errorText = error === "T-260" ? t("T-260") : error;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-637", { término: term.code })}</h1>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">
              {t("T-641", { nombre: people.get(guardado)?.fullName?.trim() ?? "" })}
            </output>
          ) : null}
          {errorText && !accion ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {errorText}
            </p>
          ) : null}
        </div>
        <form action="/admin/asambleas" method="get" className="flex items-center gap-2 text-sm">
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
          <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
            {t("T-250")}
          </button>
        </form>
      </header>

      <section aria-label={tList("T-565")[0] ?? ""} className="flex flex-col gap-3">
        {assemblies.length === 0 ? (
          <p className="text-tinta-suave">{t("T-643")}</p>
        ) : (
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {assemblies.map((item) => {
              const cell = occasionStatusCell(item.status);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
                >
                  <span className="flex flex-wrap gap-2">
                    <Insignia fondo="naranja">
                      {kindLabels[ASSEMBLY_KINDS.indexOf(item.assemblyKind ?? "ORDINARY")] ?? ""}
                    </Insignia>
                    <Insignia fondo={cell.badge}>{cell.text}</Insignia>
                  </span>
                  <Link href={`/admin/ocasiones/${item.id}`} className="text-display-md">
                    {item.title}
                  </Link>
                  <span className="text-sm text-tinta-suave">{formatDateTime(item.startsAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={columns[5] ?? ""} className="flex flex-col gap-3">
        <nav aria-label={columns[5] ?? ""} className="flex flex-wrap gap-2">
          {FILTERS.map((key, index) => (
            <Link
              key={key}
              href={`${base}&filtro=${key}`}
              aria-current={key === filter ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                key === filter ? "bg-oe-navy text-oe-paper" : "border border-borde text-titulo"
              }`}
            >
              {filterLabels[index] ?? key}
            </Link>
          ))}
        </nav>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {columns.map((label) => (
                  <th key={label} className="eyebrow py-2 pr-4 text-xs">
                    {label}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.personId} className="border-borde border-t">
                  <td className="py-2 pr-4 font-semibold">
                    {row.anonymized ? (
                      t("T-223")
                    ) : (
                      <Link href={`/admin/personas/${row.personId}?pestana=participacion`}>
                        {row.name}
                      </Link>
                    )}
                    {row.requirement.adjusted ? (
                      <span className="ml-2 text-xs text-tinta-suave">{ajustado}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{row.requirement.requiredOrdinary}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.compliance.ordinaryAttended}</td>
                  <td className="py-2 pr-4">
                    {row.requirement.requiresBoardElection
                      ? row.compliance.boardElectionAttended
                        ? si
                        : no
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {row.requirement.requiresRunoff
                      ? row.compliance.runoffAttended
                        ? si
                        : no
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <Insignia fondo={row.compliance.compliant ? "amarillo" : "naranja"}>
                      {row.compliance.compliant ? cumple : noCumple}
                    </Insignia>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`${base}&accion=ajustar&personId=${row.personId}`}
                      className="boton-secundario min-h-8 px-3 py-1 text-xs"
                    >
                      {tituloAjuste}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {accion === "ajustar" && target ? (
        <ResourcePanel title={tituloAjuste ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={adjustRequirementAction} className="flex flex-col gap-4">
            <input type="hidden" name="termId" value={term.id} />
            <input type="hidden" name="personId" value={target.personId} />
            <p className="font-semibold">{target.name}</p>
            {errorText ? (
              <p role="alert" className="font-semibold text-oe-orange">
                {errorText}
              </p>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{campoOrdinarias}</span>
              <input
                name="requiredOrdinary"
                type="number"
                min={0}
                max={10}
                defaultValue={target.requirement.requiredOrdinary}
                required
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                name="requiresBoardElection"
                type="checkbox"
                defaultChecked={target.requirement.requiresBoardElection}
                className="size-5 accent-oe-navy"
              />
              <span>{campoEleccion}</span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                name="requiresRunoff"
                type="checkbox"
                defaultChecked={target.requirement.requiresRunoff}
                className="size-5 accent-oe-navy"
              />
              <span>{campoSegunda}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{campoMotivo}</span>
              <textarea
                name="reason"
                required
                rows={3}
                defaultValue={target.requirement.reason ?? ""}
                className={inputClass}
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className="boton-primario">
                {t("T-253")}
              </button>
              <Link href={base} className="boton-secundario">
                {t("T-254")}
              </Link>
            </div>
          </form>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
