import type { Metadata } from "next";
import Link from "next/link";
import { excerpt } from "@/modules/content";
import { listPublishedCommittees } from "@/modules/people";
import { BarraTitulo, Cartel, feedVariant } from "@/shared/brand";
import { t } from "@/shared/copy";
import { stripAccents } from "@/shared/lib/accents";
import { paginaMetadata } from "@/shared/lib/seo";

export const metadata: Metadata = paginaMetadata({
  title: t("T-309"),
  description: t("T-022"),
  path: "/comites",
});

// Los comités publicados, cada uno como cartel con su logo tintado; el roster nunca se muestra.
export default async function ComitesPage({ searchParams }: PageProps<"/comites">) {
  const [comites, params] = await Promise.all([listPublishedCommittees(), searchParams]);
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 120);
  const normalize = (value: string) => stripAccents(value).toLocaleLowerCase("es");
  const matching = comites
    .map((comite, index) => ({ comite, index }))
    .filter(({ comite }) => normalize(`${comite.name} ${comite.slug}`).includes(normalize(q)));
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-6">
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {t("T-309")}
        </BarraTitulo>
        <p className="max-w-prose text-lg">{t("T-022")}</p>
      </div>
      <div className="flex flex-col gap-4">
        <search aria-label={t("T-1544")}>
          <form action="/comites" method="get" className="portal-committee-search">
            <label>
              {t("T-1544")}
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={120}
                aria-describedby="comites-search-help"
              />
            </label>
            <button type="submit" className="boton-primario">
              {t("T-1545")}
            </button>
            {q ? (
              <Link href="/comites" className="boton-secundario">
                {t("T-1474")}
              </Link>
            ) : null}
          </form>
        </search>
        <p id="comites-search-help" className="text-sm text-tinta-suave">
          {t("T-1546")}
        </p>
        <output className="text-sm font-semibold">
          {t("T-1547", { n: matching.length, total: comites.length })}
        </output>
      </div>
      {matching.length === 0 ? (
        <p className="rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
          {t(q ? "T-1550" : "T-1551")}
        </p>
      ) : null}
      <ul
        className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={t("T-309")}
      >
        {matching.map(({ comite, index }) => {
          const resumen = excerpt(comite.presentation ?? "", 120);
          return (
            <li key={comite.id}>
              <Link href={`/comites/${comite.slug}`} className="block no-underline">
                <Cartel
                  variante={feedVariant(index)}
                  nivel="h2"
                  titulo={comite.name}
                  eyebrow={comite.slug.toLocaleUpperCase("es")}
                  isotipo={!comite.logoKey}
                  {...(comite.logoKey
                    ? { comite: { slug: comite.logoKey, name: comite.name } }
                    : {})}
                  {...(resumen ? { subtitulo: resumen } : {})}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
