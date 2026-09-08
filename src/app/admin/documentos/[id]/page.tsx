import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDocumentWithArticles } from "@/modules/content";
import { DocumentReader } from "@/modules/content/components/DocumentReader";
import { requireAdminActor } from "@/modules/identity";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { publicationAction } from "../actions";

const ID = /^[a-z0-9]{10,40}$/;

async function loadPreview(id: string) {
  // También protege la metadata: ni el título de un borrador llega a un miembro.
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

export default async function DocumentPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await loadPreview((await params).id);
  if (!detail) notFound();
  const [draft, published] = tList("T-288");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <aside className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-fondo-suave p-4">
        <Insignia fondo={detail.document.status === "PUBLISHED" ? "azul" : "sky"}>
          {detail.document.status === "PUBLISHED" ? published : draft}
        </Insignia>
        <p className="max-w-prose text-sm">{t("T-1283")}</p>
      </aside>
      <DocumentReader detail={detail} backHref="/admin/documentos" backLabel={t("T-1284")} />
      <form action={publicationAction}>
        <input type="hidden" name="id" value={detail.document.id} />
        <input type="hidden" name="contentSha256" value={detail.document.contentSha256 ?? ""} />
        <input
          type="hidden"
          name="intent"
          value={detail.document.status === "PUBLISHED" ? "unpublish" : "publish"}
        />
        <button type="submit" className="boton-secundario">
          {detail.document.status === "PUBLISHED" ? t("T-343") : t("T-342")}
        </button>
      </form>
    </div>
  );
}
