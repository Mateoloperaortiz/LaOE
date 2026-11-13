import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicMediaRef, Imagen } from "@/modules/content";
import { getPublishedEvent, listPublishedEditionsOf } from "@/modules/events";
import { BarraTitulo, Elemento } from "@/shared/brand";
import { t } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { Markdown } from "@/shared/ui/Markdown";
import { Afiche, PanelGrafico } from "../../_ui/Afiche";
import { EdicionTarjeta } from "../../_ui/EdicionTarjeta";

// Identidad de un evento permanente y sus ediciones publicadas.

const SLUG = /^[a-z0-9-]{2,60}$/;

async function cargar(slug: string) {
  return SLUG.test(slug) ? getPublishedEvent(slug) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/eventos/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const evento = await cargar(slug);
  if (!evento) {
    return {};
  }
  return paginaMetadata({
    title: evento.name,
    description: evento.summary,
    path: `/eventos/${evento.slug}`,
  });
}

export default async function EventoPage({ params }: PageProps<"/eventos/[slug]">) {
  const { slug } = await params;
  const evento = await cargar(slug);
  if (!evento) {
    notFound();
  }
  const [ediciones, portada] = await Promise.all([
    listPublishedEditionsOf(evento.id),
    evento.coverAssetId ? getPublicMediaRef(evento.coverAssetId) : Promise.resolve(null),
  ]);
  const now = new Date();
  return (
    <>
      <Afiche
        variante="navy"
        eyebrow={t("T-304")}
        titulo={evento.name}
        {...(evento.summary ? { bajada: evento.summary } : {})}
        visual={
          <PanelGrafico elemento="estrella">
            {portada ? (
              <Imagen
                asset={portada}
                alt={t("T-315", { título: evento.name })}
                sizes="(min-width: 1024px) 480px, 100vw"
                priority
              />
            ) : null}
          </PanelGrafico>
        }
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6 sm:py-12">
        {evento.description.trim() ? <Markdown source={evento.description} /> : null}

        <section aria-labelledby="ediciones" className="flex flex-col gap-6">
          <BarraTitulo color="amarillo" className="self-start">
            <span id="ediciones">{t("T-305")}</span>
          </BarraTitulo>
          {ediciones.length === 0 ? (
            <div className="flex max-w-2xl items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
              <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
              <p className="text-lg">{t("T-306")}</p>
            </div>
          ) : (
            <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
              {ediciones.map((edicion) => (
                <li key={edicion.id}>
                  <EdicionTarjeta edicion={edicion} now={now} />
                </li>
              ))}
            </ul>
          )}
          <p>
            <a href="/api/ics/publico.ics" className="boton-secundario">
              {t("T-308")}
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
