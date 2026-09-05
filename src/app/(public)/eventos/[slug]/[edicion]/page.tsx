import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnv } from "@/env";
import { excerpt, getPublicMediaRef, Imagen } from "@/modules/content";
import { getPublishedEdition } from "@/modules/events";
import { findOpenRegistrationForm, isRegistered } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { listCommitteesByIds } from "@/modules/people";
import { Cartel, Insignia, LogoComite } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";
import { mediaUrl } from "@/shared/lib/media";
import { paginaMetadata } from "@/shared/lib/seo";
import { Markdown } from "@/shared/ui/Markdown";
import { edicionPasada } from "../../../_ui/EdicionTarjeta";

// Micrositio de una edición: cuándo, dónde, quiénes organizan, inscripción externa y descripción.

const SLUG = /^[a-z0-9-]{2,60}$/;

async function cargar(slug: string, edicion: string) {
  return SLUG.test(slug) && SLUG.test(edicion) ? getPublishedEdition(slug, edicion) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/eventos/[slug]/[edicion]">): Promise<Metadata> {
  const { slug, edicion: edicionSlug } = await params;
  const edicion = await cargar(slug, edicionSlug);
  if (!edicion) {
    return {};
  }
  return paginaMetadata({
    title: `${edicion.name} · ${edicion.event.name}`,
    description: excerpt(edicion.description, 160) || edicion.location,
    path: `/eventos/${edicion.event.slug}/${edicion.slug}`,
  });
}

export default async function EdicionPage({ params }: PageProps<"/eventos/[slug]/[edicion]">) {
  const { slug, edicion: edicionSlug } = await params;
  const edicion = await cargar(slug, edicionSlug);
  if (!edicion) {
    notFound();
  }
  const [portada, organizadores, nonce] = await Promise.all([
    edicion.coverAssetId ? getPublicMediaRef(edicion.coverAssetId) : Promise.resolve(null),
    listCommitteesByIds(edicion.committeeIds),
    headers().then((list) => list.get("x-nonce") ?? undefined),
  ]);
  const now = new Date();
  const pasada = edicionPasada(edicion, now);
  // Inscripción propia (ADR-037 regla 5): el formulario abierto con la acción de esta edición.
  const formularioInscripcion = pasada ? null : await findOpenRegistrationForm(edicion.id, now);
  const actor = formularioInscripcion ? await getActor() : null;
  const yaInscrito = actor ? await isRegistered(edicion.id, actor.personId) : false;
  const [cuando, donde, organizan] = t("T-307")
    .split("·")
    .map((item) => item.trim());
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: `${edicion.name} · ${edicion.event.name}`,
    startDate: edicion.startsAt.toISOString(),
    ...(edicion.endsAt ? { endDate: edicion.endsAt.toISOString() } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    ...(edicion.location ? { location: { "@type": "Place", name: edicion.location } } : {}),
    organizer: { "@type": "Organization", name: t("T-001"), url: base },
    url: `${base}/eventos/${edicion.event.slug}/${edicion.slug}`,
    ...(portada ? { image: `${base}${mediaUrl(portada.id, 1600)}` } : {}),
    ...(edicion.description ? { description: excerpt(edicion.description, 300) } : {}),
  };

  return (
    <article className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <script
        type="application/ld+json"
        nonce={nonce}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD serializado con < escapado, sin datos de personas
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <header className="flex flex-col gap-5">
        <Link href={`/eventos/${edicion.event.slug}`} className="eyebrow self-start">
          {t("T-318", { evento: edicion.event.name })}
        </Link>
        {portada ? (
          <Imagen
            asset={portada}
            alt={t("T-315", { título: edicion.name })}
            priority
            className="aspect-[21/9] w-full rounded-[var(--radius-cartel)] border border-borde object-cover"
          />
        ) : (
          <Cartel
            variante={pasada ? "paper" : "amarillo"}
            nivel="h1"
            tamano="hero"
            eyebrow={edicion.event.name}
            titulo={edicion.name}
            {...(edicion.location ? { subtitulo: edicion.location } : {})}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {portada ? <h1 className="text-display-lg sm:text-display-xl">{edicion.name}</h1> : null}
          <Insignia fondo={pasada ? "paper" : "amarillo"}>
            {pasada ? t("T-312") : t("T-311")}
          </Insignia>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-8">
          <dl className="grid gap-x-8 gap-y-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito sm:grid-cols-[auto_1fr]">
            <dt className="eyebrow text-xs text-tinta-suave">{cuando}</dt>
            <dd className="text-lg font-semibold">
              {formatDateRange(edicion.startsAt, edicion.endsAt)}
            </dd>
            {edicion.location ? (
              <>
                <dt className="eyebrow text-xs text-tinta-suave">{donde}</dt>
                <dd className="text-lg">{edicion.location}</dd>
              </>
            ) : null}
            {organizadores.length > 0 ? (
              <>
                <dt className="eyebrow text-xs text-tinta-suave">{organizan}</dt>
                <dd>
                  <ul className="flex list-none flex-wrap gap-4 p-0">
                    {organizadores.map((comite) => {
                      const contenido = (
                        <span className="flex items-center gap-2 text-titulo">
                          {comite.logoKey ? (
                            <LogoComite slug={comite.logoKey} name={comite.name} size={40} />
                          ) : null}
                          <span className="font-semibold">{comite.name}</span>
                        </span>
                      );
                      return (
                        <li key={comite.id}>
                          {comite.isPublished ? (
                            <Link href={`/comites/${comite.slug}`} className="no-underline">
                              {contenido}
                            </Link>
                          ) : (
                            contenido
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </dd>
              </>
            ) : null}
          </dl>
          {edicion.description.trim() ? <Markdown source={edicion.description} /> : null}
        </div>
        <aside className="flex flex-col items-start gap-4">
          {formularioInscripcion ? (
            yaInscrito ? (
              <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
                {t("T-869")}
              </p>
            ) : (
              <Link href={`/f/${formularioInscripcion.slug}`} className="boton-calido">
                {t("T-019")}
              </Link>
            )
          ) : null}
          {edicion.registrationUrl && !pasada ? (
            <a
              href={edicion.registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="boton-calido"
            >
              {t("T-020")}
            </a>
          ) : null}
          <a href="/api/ics/publico.ics" className="boton-secundario">
            {t("T-308")}
          </a>
        </aside>
      </div>
    </article>
  );
}
