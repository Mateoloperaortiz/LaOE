import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { CHALLENGE_KINDS, type ChallengeState, listChallengesAdmin } from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { Pagination } from "@/shared/admin-kit";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Lista de retos del admin (ADR-067 regla 16): filtros por semestre, estado y formato.

export const metadata: Metadata = { title: tList("T-2405")[1] ?? "" };

type Search = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 50;
const inputClass =
  "rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";
const STATES: ChallengeState[] = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "CANCELLED"];

export default async function RetosPage({ searchParams }: PageProps<"/admin/gamificacion/retos">) {
  await requireAdminActor("/admin/gamificacion/retos");
  const search = (await searchParams) as Search;
  const termId = single(search.termId);
  const state = single(search.estado);
  const kind = single(search.formato);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const page = Math.max(1, Number.parseInt(single(search.pagina) || "1", 10) || 1);
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === termId) ?? current ?? terms[0];
  const columns = tList("T-2582");
  const filters = tList("T-2565");
  const kindLabels = tList("T-2409");
  const stateLabels = tList("T-2511");
  const [title, empty] = tList("T-2574");

  const result = term
    ? await listChallengesAdmin({
        termId: term.id,
        state: (STATES.includes(state as ChallengeState) ? state : undefined) as
          | ChallengeState
          | undefined,
        kind: CHALLENGE_KINDS.includes(kind as never) ? (kind as never) : undefined,
        page,
        pageSize: PAGE_SIZE,
      })
    : { rows: [], total: 0 };
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const current_ = new URLSearchParams();
  if (term) current_.set("termId", term.id);
  if (state) current_.set("estado", state);
  if (kind) current_.set("formato", kind);
  const hrefFor = (extra: Record<string, string>) => {
    const params = new URLSearchParams(current_);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const query = params.toString();
    return `/admin/gamificacion/retos${query ? `?${query}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{title}</h1>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <Link href="/admin/gamificacion/retos/nuevo" className="boton-calido">
          {t("T-2503")}
        </Link>
      </header>

      <form
        action="/admin/gamificacion/retos"
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filters[0]}</span>
          <select name="termId" defaultValue={term?.id ?? ""} className={inputClass}>
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filters[1]}</span>
          <select name="estado" defaultValue={state} className={inputClass}>
            <option value="">—</option>
            {STATES.map((value, index) => (
              <option key={value} value={value}>
                {stateLabels[index] ?? value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filters[2]}</span>
          <select name="formato" defaultValue={kind} className={inputClass}>
            <option value="">—</option>
            {CHALLENGE_KINDS.map((value, index) => (
              <option key={value} value={value}>
                {kindLabels[index] ?? value}
              </option>
            ))}
          </select>
        </label>
        <AdminSubmitButton type="submit" className="boton-secundario">
          {t("T-250")}
        </AdminSubmitButton>
      </form>

      {result.rows.length === 0 ? (
        <p className="text-tinta-suave">{empty}</p>
      ) : (
        <AdminTableRegion label={title}>
          <table className="admin-data-table w-full text-sm">
            <thead>
              <tr className="text-left">
                {columns.map((label) => (
                  <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-borde border-t">
                  <td data-label={columns[0]} className="py-2 pr-4 font-semibold">
                    <Link href={`/admin/gamificacion/retos/${row.id}`}>{row.title}</Link>
                  </td>
                  <td data-label={columns[1]} className="py-2 pr-4">
                    {kindLabels[CHALLENGE_KINDS.indexOf(row.kind)] ?? row.kind}
                  </td>
                  <td data-label={columns[2]} className="py-2 pr-4">
                    {stateLabels[STATES.indexOf(row.state)] ?? row.state}
                  </td>
                  <td data-label={columns[3]} className="py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(row.opensAt)}
                  </td>
                  <td data-label={columns[4]} className="py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(row.closesAt)}
                  </td>
                  <td data-label={columns[5]} className="py-2 pr-4 tabular-nums">
                    {row.basePoints}
                  </td>
                  <td data-label={columns[6]} className="py-2 pr-4 tabular-nums">
                    {row.participants}
                  </td>
                  <td data-label={columns[7]} className="py-2 pr-4 tabular-nums">
                    {row.pending}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableRegion>
      )}
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(n) => hrefFor({ pagina: String(n) })}
        labels={{
          summary: t("T-257", { n: page, total: totalPages }),
          previous: tList("T-258")[0] ?? "",
          next: tList("T-258")[1] ?? "",
        }}
      />
    </div>
  );
}
