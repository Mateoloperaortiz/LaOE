import type { Metadata } from "next";
import {
  DOCUMENT_KINDS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIN_BYTES,
  listDocuments,
} from "@/modules/content";
import { DocumentUploader } from "@/modules/content/components/DocumentUploader";
import { requireAdminActor } from "@/modules/identity";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { loadArticlesAction, publicationAction } from "./actions";

// Documentos de normativa (ADR-034 regla 9): UI a medida como Medios: subir el PDF, cargar los
// artículos desde el JSON del extractor y publicar.

const [plural] = tList("T-425") as [string, string];

export const metadata: Metadata = { title: plural };

export default async function DocumentosPage({ searchParams }: PageProps<"/admin/documentos">) {
  await requireAdminActor("/admin/documentos");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const cargado = typeof params.cargado === "string" ? params.cargado : "";
  const error = typeof params.error === "string" ? params.error : "";
  const { rows } = await listDocuments({ q, page: 1, pageSize: 100 });
  const columnas = tList("T-500");
  const [borrador, publicado] = tList("T-288") as [string, string];
  const kinds = tList("T-394");
  const [publico, soloMiembros] = tList("T-339") as [string, string];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display-lg">{plural}</h1>
      <DocumentUploader
        kindCodes={DOCUMENT_KINDS}
        minBytes={DOCUMENT_MIN_BYTES}
        maxBytes={DOCUMENT_MAX_BYTES}
        labels={{
          fields: tList("T-494"),
          kinds,
          audiences: [publico, soloMiembros],
          help: t("T-496"),
          uploading: t("T-359"),
          done: t("T-520"),
          errorType: t("T-501"),
          errorSize: t("T-519"),
          errorUpload: t("T-518"),
          errorTitle: t("T-494"),
        }}
      />
      {cargado ? (
        <output className="block text-sm font-semibold text-titulo">
          {t("T-498", { n: cargado })}
        </output>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="inline-block self-start rounded-lg bg-oe-orange px-2 py-1 text-sm text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
        <table className="w-full text-left text-sm">
          <thead className="eyebrow bg-fondo-suave text-xs">
            <tr>
              {columnas.map((columna) => (
                <th key={columna} scope="col" className="px-4 py-3">
                  {columna}
                </th>
              ))}
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{t("T-497")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-borde">
                <td colSpan={columnas.length + 1} className="px-4 py-6 text-tinta-suave">
                  {t("T-256")}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-borde align-top">
                <td className="px-4 py-3 font-semibold">{row.title}</td>
                <td className="px-4 py-3">{kinds[DOCUMENT_KINDS.indexOf(row.kind)] ?? row.kind}</td>
                <td className="px-4 py-3">{row.version}</td>
                <td className="px-4 py-3">{row.articleCount}</td>
                <td className="px-4 py-3">
                  <Insignia fondo={row.status === "PUBLISHED" ? "azul" : "sky"}>
                    {row.status === "PUBLISHED" ? publicado : borrador}
                  </Insignia>
                </td>
                <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <form action={publicationAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input
                        type="hidden"
                        name="intent"
                        value={row.status === "PUBLISHED" ? "unpublish" : "publish"}
                      />
                      <button type="submit" className="boton-secundario text-sm">
                        {row.status === "PUBLISHED" ? t("T-343") : t("T-342")}
                      </button>
                    </form>
                    <form action={loadArticlesAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={row.id} />
                      <label htmlFor={`json-${row.id}`} className="sr-only">
                        {t("T-497")}
                      </label>
                      <input
                        id={`json-${row.id}`}
                        name="json"
                        type="file"
                        accept="application/json,.json"
                        required
                        className="block max-w-56 text-sm file:mr-2 file:rounded-full file:border-0 file:bg-fondo-suave file:px-3 file:py-1 file:text-xs file:font-bold file:text-titulo"
                      />
                      <button type="submit" className="boton-secundario text-sm">
                        {t("T-497")}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
