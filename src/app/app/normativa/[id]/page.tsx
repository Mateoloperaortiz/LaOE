import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { actorContext } from "@/app/_lib/actor";
import { downloadHref, isDownloadPending } from "@/app/_lib/download";
import { getPublishedDocumentWithArticles } from "@/modules/content";
import { DocumentReader } from "@/modules/content/components/DocumentReader";
import { recordOnboardingEvidence } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { t } from "@/shared/copy";

// Lector de un documento (ADR-034 regla 9): índice por capítulo, artículos con ancla y el PDF
// original por enlace prefirmado. Abrirlo cuenta como evidencia del onboarding, que se audita con la IP
// de este request: se lee antes de `after()`, que corre cuando la página ya respondió (ADR-123 regla 3).

const ID = /^[a-z0-9]{10,40}$/;

async function cargar(id: string) {
  return ID.test(id) ? getPublishedDocumentWithArticles(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/app/normativa/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requireActor(`/app/normativa/${id}`);
  const detail = await cargar(id);
  return { title: detail?.document.title ?? t("T-389") };
}

export default async function DocumentoPage({
  params,
  searchParams,
}: PageProps<"/app/normativa/[id]">) {
  const { id } = await params;
  const actor = await requireActor(`/app/normativa/${id}`);
  const detail = await cargar(id);
  if (!detail) {
    notFound();
  }
  const who = await actorContext(actor);
  after(() => recordOnboardingEvidence(who.personId, "NORMATIVA_READ", who.ip));
  const documentId = detail.document.id;
  return (
    <DocumentReader
      detail={detail}
      backHref="/app/normativa"
      backLabel={t("T-399")}
      pdfHref={downloadHref(`/api/documentos/${documentId}/pdf`, `/app/normativa/${documentId}`)}
      downloadPending={isDownloadPending(await searchParams)}
    />
  );
}
