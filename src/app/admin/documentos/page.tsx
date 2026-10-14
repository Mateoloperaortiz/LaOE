import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  DOCUMENT_KINDS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIN_BYTES,
  listDocuments,
} from "@/modules/content";
import { DocumentUploader } from "@/modules/content/components/DocumentUploader";
import { requireAdminActor } from "@/modules/identity";
import { Pagination, ResourcePanel } from "@/shared/admin-kit";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

const [plural] = tList("T-425");
const PAGE_SIZE = 20;
const BASE = "/admin/documentos";

export const metadata: Metadata = { title: plural };

export default async function DocumentosPage({ searchParams }: PageProps<"/admin/documentos">) {
  await requireAdminActor(BASE);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rawPage = typeof params.pagina === "string" ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const { rows, total } = await listDocuments({ q, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (target: number, upload = false) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (target > 1) query.set("pagina", String(target));
    if (upload) query.set("nuevo", "1");
    return `${BASE}${query.size ? `?${query}` : ""}`;
  };
  if (page > totalPages) redirect(hrefFor(totalPages, params.nuevo === "1"));
  const columnas = tList("T-500");
  const [borrador, publicado] = tList("T-288");
  const kinds = tLabels("T-394", DOCUMENT_KINDS);
  const [publico, soloMiembros] = tList("T-339");
  const [previous, next] = tList("T-258");
  return (
    <div className="admin-page flex min-w-0 flex-col gap-6">
      <div className="admin-page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-lg">{plural}</h1>
          <p className="mt-2 max-w-prose text-sm text-tinta-suave">{t("T-1461")}</p>
        </div>
        <Link href={hrefFor(page, true)} className="boton-calido">
          {t("T-1460")}
        </Link>
      </div>
      <form action={BASE} method="get" className="admin-toolbar flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="document-search" className="text-sm font-semibold">
            {t("T-1463")}
          </label>
          <input
            id="document-search"
            name="q"
            type="search"
            defaultValue={q}
            className="w-full rounded-xl border border-borde bg-fondo px-3 py-2"
          />
        </div>
        <button type="submit" className="boton-secundario">
          {t("T-250")}
        </button>
        {q ? (
          <Link href={BASE} className="text-sm underline">
            {t("T-1474")}
          </Link>
        ) : null}
      </form>
      <p className="text-sm text-tinta-suave">{t("T-1423", { n: total })}</p>
      <div className="admin-table-wrap overflow-x-auto rounded-xl border border-borde">
        <table className="admin-data-table w-full text-left text-sm">
          <caption className="sr-only">{plural}</caption>
          <thead className="eyebrow bg-fondo-suave text-xs">
            <tr>
              {columnas.map((columna) => (
                <th key={columna} scope="col" className="px-4 py-3">
                  {columna}
                </th>
              ))}
              <th scope="col" className="px-4 py-3">
                {t("T-1426")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-borde">
                <td colSpan={columnas.length + 1} className="px-4 py-10 text-tinta-suave">
                  {q ? t("T-256") : t("T-1462")}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-borde align-top">
                <td data-label={columnas[0]} className="px-4 py-3 font-semibold">
                  <Link href={`${BASE}/${row.id}`}>{row.title}</Link>
                </td>
                <td data-label={columnas[1]} className="px-4 py-3">
                  {kinds[row.kind] ?? row.kind}
                </td>
                <td data-label={columnas[2]} className="px-4 py-3">
                  {row.version}
                </td>
                <td data-label={columnas[3]} className="px-4 py-3">
                  <p>{row.articleCount}</p>
                  {row.unitCount > row.articleCount ? (
                    <p className="mt-1 text-xs text-tinta-suave">
                      {t("T-1285", { n: row.unitCount - row.articleCount })}
                    </p>
                  ) : null}
                </td>
                <td data-label={columnas[4]} className="px-4 py-3">
                  <Insignia fondo={row.status === "PUBLISHED" ? "azul" : "sky"}>
                    {row.status === "PUBLISHED" ? publicado : borrador}
                  </Insignia>
                </td>
                <td data-label={columnas[5]} className="px-4 py-3">
                  {formatDateTime(row.createdAt)}
                </td>
                <td data-label={t("T-1426")} className="px-4 py-3">
                  <Link href={`${BASE}/${row.id}`} className="font-semibold underline">
                    {t("T-1282")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        labels={{ summary: t("T-257", { n: page, total: totalPages }), previous, next }}
      />
      {params.nuevo === "1" ? (
        <ResourcePanel title={t("T-1460")} closeHref={hrefFor(page)} closeLabel={t("T-291")}>
          <DocumentUploader
            kindCodes={DOCUMENT_KINDS}
            minBytes={DOCUMENT_MIN_BYTES}
            maxBytes={DOCUMENT_MAX_BYTES}
            labels={{
              fields: tList("T-494"),
              kinds: { ...kinds },
              audiences: [publico, soloMiembros],
              help: t("T-1465"),
              uploading: t("T-359"),
              done: t("T-1292"),
              errorType: t("T-501"),
              errorSize: t("T-519"),
              errorUpload: t("T-518"),
              errorTitle: t("T-1464"),
              submit: t("T-1460"),
              errorFile: t("T-1466"),
              chooseFile: t("T-1485"),
              noFile: t("T-1486"),
              replaceFile: t("T-1488"),
              removeFile: t("T-1489"),
            }}
          />
        </ResourcePanel>
      ) : null}
    </div>
  );
}
