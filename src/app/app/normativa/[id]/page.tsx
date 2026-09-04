import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { chaptersOf, DOCUMENT_KINDS, getPublishedDocumentWithArticles } from "@/modules/content";
import { recordOnboardingEvidence } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { BarraTitulo, Cartel } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Lector de un documento (ADR-034 regla 9): índice por capítulo, artículos con ancla y el PDF
// original por enlace prefirmado. Abrirlo cuenta como evidencia del onboarding.

const ID = /^[a-z0-9]{10,40}$/;

async function cargar(id: string) {
  return ID.test(id) ? getPublishedDocumentWithArticles(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/app/normativa/[id]">): Promise<Metadata> {
  const { id } = await params;
  const detail = await cargar(id);
  return { title: detail?.document.title ?? t("T-389") };
}

export default async function DocumentoPage({ params }: PageProps<"/app/normativa/[id]">) {
  const { id } = await params;
  const actor = await requireActor(`/app/normativa/${id}`);
  const detail = await cargar(id);
  if (!detail) {
    notFound();
  }
  after(() => recordOnboardingEvidence(actor.personId, "NORMATIVA_READ"));
  const kinds = tList("T-394");
  const chapters = chaptersOf(detail.articles);
  return (
    <div className="flex flex-col gap-10">
      <Cartel
        variante="navy"
        nivel="h1"
        tamano="hero"
        eyebrow={kinds[DOCUMENT_KINDS.indexOf(detail.document.kind)] ?? detail.document.kind}
        titulo={detail.document.title}
        subtitulo={t("T-395", { v: detail.document.version })}
      />
      <a
        href={`/api/documentos/${detail.document.id}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="boton-secundario self-start"
      >
        {t("T-396")}
      </a>
      {chapters.length > 0 ? (
        <nav aria-labelledby="indice" className="flex flex-col gap-4">
          <BarraTitulo color="amarillo" className="self-start">
            <span id="indice">{t("T-398")}</span>
          </BarraTitulo>
          <ol className="flex list-none flex-col gap-3 p-0">
            {chapters.map((chapter) => (
              <li key={chapter.key} className="flex flex-col gap-1">
                {chapter.title ? <p className="eyebrow text-xs">{chapter.title}</p> : null}
                <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                  {chapter.articles.map((article) => (
                    <li key={article.articleKey}>
                      <a href={`#${article.articleKey}`} className="text-sm">
                        {t("T-397", { n: article.number })}
                        {article.title ? ` · ${article.title}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {chapters.map((chapter) => (
        <section key={chapter.key} className="flex flex-col gap-6">
          {chapter.title ? (
            <BarraTitulo color="azul" className="self-start">
              {chapter.title}
            </BarraTitulo>
          ) : null}
          {chapter.articles.map((article) => (
            <article
              key={article.articleKey}
              id={article.articleKey}
              className="flex flex-col gap-2 scroll-mt-24"
            >
              <h3 className="text-display-md">
                {t("T-397", { n: article.number })}
                {article.title ? ` · ${article.title}` : ""}
              </h3>
              {article.body.split(/\n\n+/).map((paragraph, index) => (
                <p key={`${article.articleKey}-${index}`} className="max-w-prose">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </section>
      ))}
      <Link href="/app/normativa" className="self-start">
        {t("T-399")}
      </Link>
    </div>
  );
}
