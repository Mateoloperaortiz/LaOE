import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { excerpt } from "@/modules/content";
import { getPublishedCommittee } from "@/modules/people";
import { Elemento, LogoComite } from "@/shared/brand";
import { t } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { Markdown } from "@/shared/ui/Markdown";
import { Afiche } from "../../_ui/Afiche";

// Ficha editorial de un comité: logo, presentación en Markdown y contacto. Sin roster (ADR-014).

const SLUG = /^[a-z0-9-]{2,40}$/;

async function cargar(slug: string) {
  return SLUG.test(slug) ? getPublishedCommittee(slug) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/comites/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const comite = await cargar(slug);
  if (!comite) {
    return {};
  }
  return paginaMetadata({
    title: comite.name,
    description: excerpt(comite.presentation ?? "", 160),
    path: `/comites/${comite.slug}`,
  });
}

export default async function ComitePage({ params }: PageProps<"/comites/[slug]">) {
  const { slug } = await params;
  const comite = await cargar(slug);
  if (!comite) {
    notFound();
  }
  const presentacion = comite.presentation?.trim() ?? "";
  return (
    <>
      <Afiche
        variante="navy"
        eyebrow={t("T-309")}
        titulo={comite.name}
        {...(comite.logoKey
          ? {
              visual: (
                <div className="portal-afiche-logo">
                  <LogoComite slug={comite.logoKey} name={comite.name} size={150} />
                </div>
              ),
            }
          : {})}
      >
        {comite.contactUrl ? (
          <div className="portal-afiche-acciones">
            <a
              href={comite.contactUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="boton-calido"
            >
              {t("T-024")}
            </a>
          </div>
        ) : null}
      </Afiche>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        {presentacion ? (
          <Markdown source={presentacion} />
        ) : (
          <div className="flex max-w-2xl items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
            <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
            <p className="text-lg">{t("T-310")}</p>
          </div>
        )}
      </div>
    </>
  );
}
