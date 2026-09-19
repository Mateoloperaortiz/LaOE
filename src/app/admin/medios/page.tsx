import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listMedia, MEDIA_LIMITS, type MediaRow } from "@/modules/content";
import { MediaUploader } from "@/modules/content/components/MediaUploader";
import { requireAdminActor } from "@/modules/identity";
import { Pagination, ResourcePanel, ResourceTable } from "@/shared/admin-kit";
import type { Column } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { mediaUrl } from "@/shared/lib/media";

// Medios: UI a medida (ADR-017): subidor directo al bucket y listado con el estado de cada medio.

const [plural] = tList("T-334");

export const metadata: Metadata = { title: plural };
const PAGE_SIZE = 20;
const BASE = "/admin/medios";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function columns(): Column<MediaRow>[] {
  const [archivo, tamano, dimensiones, estado, subido] = tList("T-364");
  const [procesando, lista, fallo] = tList("T-358");
  return [
    {
      key: "file",
      label: archivo,
      render: (row) =>
        row.status === "READY"
          ? { text: row.originalFilename, href: mediaUrl(row.id, 480) }
          : row.originalFilename,
    },
    { key: "size", label: tamano, render: (row) => formatBytes(row.byteSize) },
    {
      key: "dimensions",
      label: dimensiones,
      render: (row) => (row.width && row.height ? `${row.width} × ${row.height}` : null),
    },
    {
      key: "status",
      label: estado,
      render: (row) =>
        row.status === "READY"
          ? { text: lista, badge: "azul" }
          : row.status === "FAILED"
            ? { text: `${fallo}${row.error ? `: ${row.error}` : ""}`, badge: "naranja" }
            : { text: procesando, badge: "sky" },
    },
    { key: "createdAt", label: subido, render: (row) => formatDateTime(row.createdAt) },
  ];
}

export default async function MediosPage({ searchParams }: PageProps<"/admin/medios">) {
  await requireAdminActor("/admin/medios");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const rawPage = typeof params.pagina === "string" ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const { rows, total } = await listMedia({ q, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hrefFor = (target: number, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (q) query.set("q", q);
    if (target > 1) query.set("pagina", String(target));
    return `${BASE}${query.size ? `?${query}` : ""}`;
  };
  if (page > totalPages) redirect(hrefFor(totalPages, params.nuevo === "1" ? { nuevo: "1" } : {}));
  const [previous, next] = tList("T-258");
  const [publica, privada] = tList("T-366");
  return (
    <div className="admin-page flex min-w-0 flex-col gap-6">
      <div className="admin-page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display-lg">{plural}</h1>
          <p className="mt-2 max-w-prose text-sm text-tinta-suave">{t("T-1473")}</p>
        </div>
        <Link href={hrefFor(page, { nuevo: "1" })} className="boton-calido">
          {t("T-356")}
        </Link>
      </div>
      {params.subido === "1" ? (
        <output className="admin-notice text-sm font-semibold">{t("T-360")}</output>
      ) : null}
      <form action={BASE} method="get" className="admin-toolbar flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="media-search" className="text-sm font-semibold">
            {t("T-1472")}
          </label>
          <input
            id="media-search"
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
      <ResourceTable
        columns={columns()}
        rows={rows}
        labels={{ edit: t("T-252"), empty: q ? t("T-256") : t("T-1471") }}
      />
      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        labels={{ summary: t("T-257", { n: page, total: totalPages }), previous, next }}
      />
      {params.nuevo === "1" ? (
        <ResourcePanel title={t("T-356")} closeHref={hrefFor(page)} closeLabel={t("T-291")}>
          <MediaUploader
            successHref={hrefFor(1, { subido: "1" })}
            allowedTypes={[...MEDIA_LIMITS.types]}
            minBytes={MEDIA_LIMITS.minBytes}
            maxBytes={MEDIA_LIMITS.maxBytes}
            labels={{
              button: t("T-356"),
              help: t("T-357"),
              uploading: t("T-359"),
              done: t("T-360"),
              errorType: t("T-361"),
              errorSize: t("T-362"),
              errorUpload: t("T-363"),
              visibility: t("T-365"),
              visibilityOptions: [publica, privada],
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
