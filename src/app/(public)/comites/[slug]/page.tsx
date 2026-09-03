import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { excerpt } from "@/modules/content";
import { getPublishedCommittee } from "@/modules/people";
import { Cartel, Elemento } from "@/shared/brand";
import { t } from "@/shared/copy";
import { Markdown } from "@/shared/ui/Markdown";

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
  const description = excerpt(comite.presentation ?? "", 160);
  return { title: comite.name, ...(description ? { description } : {}) };
}

export default async function ComitePage({ params }: PageProps<"/comites/[slug]">) {
  const { slug } = await params;
  const comite = await cargar(slug);
  if (!comite) {
    notFound();
  }
  const presentacion = comite.presentation?.trim() ?? "";
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <Cartel
        variante="navy"
        nivel="h1"
        tamano="hero"
        eyebrow={t("T-309")}
        titulo={comite.name}
        isotipo={!comite.logoKey}
        {...(comite.logoKey ? { comite: { slug: comite.logoKey, name: comite.name } } : {})}
      >
        {comite.contactUrl ? (
          <div className="mt-2">
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
      </Cartel>
      {presentacion ? (
        <Markdown source={presentacion} />
      ) : (
        <div className="flex max-w-2xl items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
          <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
          <p className="text-lg">{t("T-310")}</p>
        </div>
      )}
    </div>
  );
}
