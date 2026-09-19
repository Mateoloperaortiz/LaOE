import type { Metadata } from "next";
import Link from "next/link";
import { getPublicMediaRef, Imagen, listPublicAnnouncements } from "@/modules/content";
import { listAdmissionPipelineIds } from "@/modules/crm";
import {
  findNextPublicEdition,
  findNextPublicEditions,
  listPublishedEvents,
} from "@/modules/events";
import { findOpenPublicFormForPipelines } from "@/modules/forms";
import {
  BarraTitulo,
  Cartel,
  Elemento,
  feedVariant,
  SelloOE,
  TituloAcentuado,
} from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";
import { paginaMetadata } from "@/shared/lib/seo";
import { AnuncioCartel } from "./_ui/AnuncioCartel";
import { EventoTarjeta } from "./_ui/EventoTarjeta";

export const metadata: Metadata = {
  ...paginaMetadata({ title: t("T-002"), description: t("T-003"), path: "/" }),
  // El inicio conserva el nombre del sitio como título de pestaña; el titular va a Open Graph.
  title: { absolute: t("T-001") },
};

// Inicio: hero, próximo encuentro, macroeventos y cartelera (06-mapa-del-sitio.md).
export default async function HomePage() {
  const [anuncios, eventos, proximas, proximo, admision] = await Promise.all([
    listPublicAnnouncements(3),
    listPublishedEvents(),
    findNextPublicEditions(),
    findNextPublicEdition(),
    listAdmissionPipelineIds().then(findOpenPublicFormForPipelines),
  ]);
  const [portadas, portadaProximo] = await Promise.all([
    Promise.all(
      eventos.map((evento) =>
        evento.coverAssetId ? getPublicMediaRef(evento.coverAssetId) : Promise.resolve(null),
      ),
    ),
    proximo?.coverAssetId ? getPublicMediaRef(proximo.coverAssetId) : Promise.resolve(null),
  ]);
  const [cuando, donde] = tList("T-307");
  return (
    <div className="portal-home mx-auto flex max-w-6xl flex-col px-4 sm:px-6">
      <Cartel
        className="portal-hero"
        variante="paper"
        nivel="h1"
        tamano="hero"
        eyebrow={t("T-036")}
        titulo={<TituloAcentuado texto={t("T-002")} acento={2} />}
        subtitulo={t("T-003")}
        elemento={
          <Elemento
            tipo="bucle"
            className="absolute top-6 left-[38%] w-[46%] text-oe-blue opacity-70"
          />
        }
      >
        <div className="portal-hero-actions">
          <Link href={admision ? `/f/${admision.slug}` : "/unirse"} className="boton-calido">
            {t(admision ? "T-027" : "T-1543")}
          </Link>
          <Link href="/comites" className="boton-secundario">
            {t("T-005")}
          </Link>
        </div>
      </Cartel>

      {proximo ? (
        <section aria-labelledby="proximo" className="flex flex-col gap-8">
          <BarraTitulo color="naranja" className="self-start">
            <span id="proximo">{t("T-008")}</span>
          </BarraTitulo>
          {/* El título es el enlace; el pseudoelemento estira el área clicable a toda la tarjeta. */}
          {portadaProximo ? (
            <article className="relative grid gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-4 textura-granito sm:grid-cols-2 sm:p-6">
              <Imagen
                asset={portadaProximo}
                alt={t("T-315", { título: proximo.name })}
                sizes="(min-width: 640px) 50vw, 100vw"
                className="aspect-video w-full rounded-[var(--radius-cartel)] object-cover"
              />
              <div className="flex flex-col gap-3">
                <p className="eyebrow text-tinta-suave">{proximo.event.name}</p>
                <h3 className="text-display-md">
                  <Link
                    href={`/eventos/${proximo.event.slug}/${proximo.slug}`}
                    className="text-current no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
                  >
                    {proximo.name}
                  </Link>
                </h3>
                <p className="font-semibold">{formatDateRange(proximo.startsAt, proximo.endsAt)}</p>
                {proximo.location ? <p>{proximo.location}</p> : null}
              </div>
            </article>
          ) : (
            <Cartel
              variante="amarillo"
              nivel="h3"
              eyebrow={proximo.event.name}
              titulo={
                <Link
                  href={`/eventos/${proximo.event.slug}/${proximo.slug}`}
                  className="text-current no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
                >
                  {proximo.name}
                </Link>
              }
              isotipo={false}
            >
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="eyebrow text-xs">{cuando}</dt>
                <dd className="font-semibold">
                  {formatDateRange(proximo.startsAt, proximo.endsAt)}
                </dd>
                {proximo.location ? (
                  <>
                    <dt className="eyebrow text-xs">{donde}</dt>
                    <dd>{proximo.location}</dd>
                  </>
                ) : null}
              </dl>
            </Cartel>
          )}
        </section>
      ) : null}

      <section aria-labelledby="macroeventos" className="flex flex-col gap-8">
        <BarraTitulo color="azul" className="self-start">
          <span id="macroeventos">{t("T-006")}</span>
        </BarraTitulo>
        <p className="max-w-prose text-lg">{t("T-014")}</p>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((evento, index) => (
            <li key={evento.id}>
              <EventoTarjeta
                evento={evento}
                proxima={proximas.get(evento.id) ?? null}
                cover={portadas[index] ?? null}
                variante={feedVariant(index)}
              />
            </li>
          ))}
        </ul>
        <Link href="/eventos" className="boton-secundario self-start">
          {t("T-317")}
        </Link>
      </section>

      <section aria-labelledby="cartelera" className="flex flex-col gap-8">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="cartelera">{t("T-007")}</span>
        </BarraTitulo>
        {anuncios.length === 0 ? (
          <div className="flex flex-col items-start gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-8 textura-granito sm:flex-row sm:items-center sm:gap-10">
            <Elemento tipo="asterisco" className="size-24 shrink-0 text-oe-navy" />
            <div className="flex flex-col gap-4">
              <p className="text-lg">{t("T-009")}</p>
              <SelloOE tamano="sm" />
            </div>
          </div>
        ) : (
          <>
            <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {anuncios.map((anuncio, index) => (
                <li key={anuncio.id}>
                  <AnuncioCartel anuncio={anuncio} variante={feedVariant(index + 1)} />
                </li>
              ))}
            </ul>
            <Link href="/cartelera" className="boton-secundario self-start">
              {t("T-316")}
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
