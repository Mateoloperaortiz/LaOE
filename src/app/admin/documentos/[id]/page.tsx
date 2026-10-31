import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { downloadHref, isDownloadPending } from "@/app/_lib/download";
import { DOCUMENT_KINDS, getDocumentWithArticles } from "@/modules/content";
import { DocumentReader } from "@/modules/content/components/DocumentReader";
import { requireAdminActor } from "@/modules/identity";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { loadArticlesAction, publicationAction } from "../actions";

const ID = /^[a-z0-9]{10,40}$/;

async function loadPreview(id: string) {
  await requireAdminActor(`/admin/documentos/${id}`);
  return ID.test(id) ? getDocumentWithArticles(id) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const detail = await loadPreview((await params).id);
  return {
    title: detail ? t("T-1287", { titulo: detail.document.title }) : t("T-1282"),
    robots: { index: false, follow: false },
  };
}

export default async function DocumentPreviewPage({
  params,
  searchParams,
}: PageProps<"/admin/documentos/[id]">) {
  const detail = await loadPreview((await params).id);
  if (!detail) notFound();
  const search = await searchParams;
  const error = typeof search.error === "string" ? search.error : "";
  const loaded = typeof search.cargado === "string" ? search.cargado : "";
  const [draft, published] = tList("T-288");
  const [publicAudience, memberAudience] = tList("T-339");
  const kinds = tLabels("T-394", DOCUMENT_KINDS);
  const document = detail.document;
  return (
    <div className="admin-page flex min-w-0 flex-col gap-6">
      <header className="admin-page-header flex flex-col gap-3">
        <Link href="/admin/documentos" className="self-start text-sm underline">
          {t("T-1284")}
        </Link>
        <h1 className="text-display-lg break-words">{document.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-tinta-suave">
          <Insignia fondo={document.status === "PUBLISHED" ? "azul" : "sky"}>
            {document.status === "PUBLISHED" ? published : draft}
          </Insignia>
          <span>{kinds[document.kind]}</span>
          <span>{t("T-395", { v: document.version })}</span>
          <span>{document.audience === "PUBLIC" ? publicAudience : memberAudience}</span>
        </div>
      </header>
      {search.subido === "1" ? (
        <output className="admin-notice block text-sm font-semibold">{t("T-1292")}</output>
      ) : null}
      {loaded ? (
        <output className="admin-notice block text-sm font-semibold">
          {t("T-1290", { n: loaded })}
        </output>
      ) : null}
      {search.estado === "publicado" || search.estado === "borrador" ? (
        <output className="admin-notice block text-sm font-semibold">
          {t(search.estado === "publicado" ? "T-1469" : "T-1470")}
        </output>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-3 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <section
        aria-labelledby="document-management"
        className="admin-surface flex min-w-0 flex-col gap-4 rounded-xl border border-borde bg-fondo p-5"
      >
        <ActionForm action={loadArticlesAction} className="flex min-w-0 flex-col gap-4">
          <AdminFormBody>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="document-management" className="text-titulo-md">
                  {t("T-1467")}
                </h2>
                <p className="mt-2 max-w-prose text-sm text-tinta-suave">{t("T-1283")}</p>
              </div>
              <div>
                <input type="hidden" name="id" value={document.id} />
                <input type="hidden" name="contentSha256" value={document.contentSha256 ?? ""} />
                <input
                  type="hidden"
                  name="intent"
                  value={document.status === "PUBLISHED" ? "unpublish" : "publish"}
                />
                <AdminSubmitButton
                  type="submit"
                  formAction={publicationAction}
                  formNoValidate
                  className={document.status === "PUBLISHED" ? "boton-secundario" : "boton-calido"}
                >
                  {document.status === "PUBLISHED" ? t("T-343") : t("T-342")}
                </AdminSubmitButton>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3 border-t border-borde pt-4">
              <label htmlFor="document-json" className="text-sm font-semibold">
                {t("T-1291")}
              </label>
              <p id="document-json-help" className="max-w-prose text-sm text-tinta-suave">
                {t(document.status === "PUBLISHED" ? "T-1302" : "T-1468")}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <input
                  id="document-json"
                  name="json"
                  type="file"
                  accept="application/json,.json"
                  required
                  disabled={document.status === "PUBLISHED"}
                  aria-describedby="document-json-help"
                  className="block w-full min-w-0 text-sm sm:w-auto"
                />
                <AdminSubmitButton
                  className="boton-secundario"
                  disabled={document.status === "PUBLISHED"}
                >
                  {t("T-1291")}
                </AdminSubmitButton>
              </div>
            </div>
          </AdminFormBody>
        </ActionForm>
      </section>
      <DocumentReader
        detail={detail}
        backHref="/admin/documentos"
        backLabel={t("T-1284")}
        pdfHref={downloadHref(
          `/api/documentos/${document.id}/pdf`,
          `/admin/documentos/${document.id}`,
        )}
        downloadPending={isDownloadPending(search)}
        showHeader={false}
      />
    </div>
  );
}
