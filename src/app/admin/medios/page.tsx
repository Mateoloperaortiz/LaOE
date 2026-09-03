import type { Metadata } from "next";
import { listMedia, MEDIA_LIMITS, type MediaRow } from "@/modules/content";
import { MediaUploader } from "@/modules/content/components/MediaUploader";
import { requireAdminActor } from "@/modules/identity";
import { ResourceTable } from "@/shared/admin-kit";
import type { Column } from "@/shared/admin-kit/types";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { mediaUrl } from "@/shared/lib/media";

// Medios: UI a medida (ADR-017): subidor directo al bucket y listado con el estado de cada medio.

const [plural] = tList("T-334") as [string, string];

export const metadata: Metadata = { title: plural };

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function columns(): Column<MediaRow>[] {
  const [archivo, tamano, dimensiones, estado, subido] = tList("T-364") as [
    string,
    string,
    string,
    string,
    string,
  ];
  const [procesando, lista, fallo] = tList("T-358") as [string, string, string];
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
  const { rows } = await listMedia({ q, page: 1, pageSize: 100 });
  const [publica, privada] = tList("T-366") as [string, string];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display-lg">{plural}</h1>
      <MediaUploader
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
        }}
      />
      <ResourceTable
        columns={columns()}
        rows={rows}
        labels={{ edit: t("T-252"), empty: t("T-256") }}
      />
    </div>
  );
}
