import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { listLedger, POINT_ENTRY_KINDS, type PointEntryKind } from "@/modules/participation";
import { getPeopleByIds, searchPeople } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { Pagination, ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { adjustAction, reverseAction } from "./actions";

// Ledger de GH Points para GH (ADR-007, ADR-035 regla 9): filtros, ajustes con motivo y reversiones.

export const metadata: Metadata = { title: t("T-622") };

type Search = Record<string, string | string[] | undefined>;

const PAGE_SIZE = 50;
const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function LedgerPage({ searchParams }: PageProps<"/admin/ledger">) {
  await requireAdminActor("/admin/ledger");
  const search = (await searchParams) as Search;
  const q = single(search.q).trim();
  const personId = single(search.personId);
  const termId = single(search.termId);
  const kind = single(search.kind);
  const accion = single(search.accion);
  const entrada = single(search.entrada);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const page = Math.max(1, Number.parseInt(single(search.pagina) || "1", 10) || 1);

  const [terms, found, ledger] = await Promise.all([
    listAllTerms(),
    q ? searchPeople(q) : Promise.resolve([]),
    listLedger({
      personId: personId || undefined,
      termId: termId || undefined,
      kind,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const ids = new Set(ledger.rows.map((row) => row.personId));
  for (const row of ledger.rows) {
    if (row.createdById) ids.add(row.createdById);
  }
  if (personId) ids.add(personId);
  const people = await getPeopleByIds([...ids]);
  const termCode = new Map(terms.map((item) => [item.id, item.code]));
  const kindLabels = tLabels("T-085", POINT_ENTRY_KINDS);
  const columns = tList("T-623");
  const [filtroPersona, filtroSemestre, filtroMovimiento] = tList("T-624");
  const [campoPersona, campoSemestre, campoPuntos, campoMotivo] = tList("T-626");
  const totalPages = Math.max(1, Math.ceil(ledger.total / PAGE_SIZE));
  const base = "/admin/ledger";
  const current = new URLSearchParams();
  if (personId) current.set("personId", personId);
  if (termId) current.set("termId", termId);
  if (kind) current.set("kind", kind);
  if (page > 1) current.set("pagina", String(page));
  if (q) current.set("q", q);
  const hrefFor = (extra: Record<string, string>) => {
    const params = new URLSearchParams(current);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };
  const backHref = hrefFor({});
  if (page > totalPages) redirect(hrefFor({ pagina: String(totalPages), accion, entrada }));
  const toReverse = entrada ? ledger.rows.find((row) => row.id === entrada) : undefined;
  const openTerms = terms.filter((item) => item.pointsClosedAt === null);
  const errorText = error === "T-260" ? t("T-260") : error;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-622")}</h1>
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
        ) : null}
        {errorText ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {errorText}
          </p>
        ) : null}
      </header>

      <ActionForm
        key={JSON.stringify([q, termId, kind])}
        action={base}
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filtroPersona}</span>
          <input name="q" defaultValue={q} className={inputClass} placeholder={t("T-264")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filtroSemestre}</span>
          <select name="termId" defaultValue={termId} className={inputClass}>
            <option value="">—</option>
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{filtroMovimiento}</span>
          <select name="kind" defaultValue={kind} className={inputClass}>
            <option value="">—</option>
            {POINT_ENTRY_KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabels[value] ?? value}
              </option>
            ))}
          </select>
        </label>
        {personId ? <input type="hidden" name="personId" value={personId} /> : null}
        <AdminSubmitButton type="submit" className="boton-secundario">
          {t("T-250")}
        </AdminSubmitButton>
      </ActionForm>

      {q ? (
        found.length === 0 ? (
          <p className="text-tinta-suave">{t("T-256")}</p>
        ) : (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {found.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-full border border-borde px-3 py-1 text-sm"
              >
                <Link href={hrefFor({ personId: item.id })} className="font-semibold">
                  {item.fullName.trim()}
                </Link>
                <Link
                  href={hrefFor({ personId: item.id, accion: "ajustar" })}
                  className="underline"
                >
                  {t("T-625")}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {personId ? (
        <p className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{people.get(personId)?.fullName?.trim()}</span>
          <Link
            href={hrefFor({ accion: "ajustar" })}
            className="boton-primario min-h-9 px-4 py-1 text-sm"
          >
            {t("T-625")}
          </Link>
          <Link
            href={`/admin/personas/${personId}?pestana=participacion`}
            className="text-sm underline"
          >
            {tList("T-432")[3]}
          </Link>
        </p>
      ) : null}

      {ledger.rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-256")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-data-table w-full text-sm">
            <thead>
              <tr className="text-left">
                {columns.map((label) => (
                  <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                    {label}
                  </th>
                ))}
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((row) => (
                <tr key={row.id} className="border-borde border-t">
                  <td data-label={columns[0]} className="py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td data-label={columns[1]} className="py-2 pr-4 font-semibold">
                    <Link href={`/admin/personas/${row.personId}?pestana=participacion`}>
                      {people.get(row.personId)?.fullName?.trim() ?? ""}
                    </Link>
                  </td>
                  <td data-label={columns[2]} className="py-2 pr-4">
                    {termCode.get(row.termId) ?? ""}
                  </td>
                  <td data-label={columns[3]} className="py-2 pr-4">
                    {kindLabels[row.kind as PointEntryKind] ?? row.kind}
                  </td>
                  <td
                    data-label={columns[4]}
                    className={`py-2 pr-4 tabular-nums ${row.points < 0 ? "text-oe-orange" : ""}`}
                  >
                    {row.points > 0 ? `+${row.points}` : row.points}
                  </td>
                  <td data-label={columns[5]} className="py-2 pr-4">
                    {row.reason}
                  </td>
                  <td data-label={columns[6]} className="py-2 pr-4">
                    {row.createdById
                      ? (people.get(row.createdById)?.fullName?.trim() ?? "")
                      : t("T-515")}
                  </td>
                  <td data-label={t("T-1500")} className="py-2">
                    {(row.kind === "ADJUSTMENT" || row.kind === "LEGACY") && !row.reversedById ? (
                      <Link
                        href={hrefFor({ accion: "revertir", entrada: row.id })}
                        className="boton-secundario min-h-8 px-3 py-1 text-xs"
                      >
                        {t("T-630")}
                      </Link>
                    ) : row.reversedById ? (
                      <span className="text-xs text-tinta-suave">{tList("T-085")[2]}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      {accion === "ajustar" && personId ? (
        <ResourcePanel title={t("T-625")} closeHref={backHref} closeLabel={t("T-291")}>
          <ActionForm action={adjustAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="back" value={backHref} />
              <div className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{campoPersona}</span>
                <p className="font-semibold">{people.get(personId)?.fullName?.trim()}</p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{campoSemestre}</span>
                <select
                  name="termId"
                  required
                  defaultValue={termId || openTerms[0]?.id}
                  className={inputClass}
                >
                  {openTerms.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{campoPuntos}</span>
                <input name="points" type="number" step={1} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{campoMotivo}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
                <span className="text-xs text-tinta-suave">{t("T-628")}</span>
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={backHref} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </ActionForm>
        </ResourcePanel>
      ) : null}

      {accion === "revertir" && toReverse ? (
        <ResourcePanel title={t("T-630")} closeHref={backHref} closeLabel={t("T-291")}>
          <ActionForm action={reverseAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="entryId" value={toReverse.id} />
              <input type="hidden" name="back" value={backHref} />
              <p>
                {t("T-631", {
                  puntos: toReverse.points,
                  nombre: people.get(toReverse.personId)?.fullName?.trim() ?? "",
                  motivo: toReverse.reason,
                })}
              </p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{campoMotivo}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-630")}
                </AdminSubmitButton>
                <Link href={backHref} className="boton-secundario">
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
