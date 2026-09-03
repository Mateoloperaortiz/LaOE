import type { Metadata } from "next";
import Link from "next/link";
import { excerpt } from "@/modules/content";
import { listPublishedCommittees } from "@/modules/people";
import { BarraTitulo, Cartel, feedVariant } from "@/shared/brand";
import { t } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-309") };

// Los comités publicados, cada uno como cartel con su logo tintado; el roster nunca se muestra.
export default async function ComitesPage() {
  const comites = await listPublishedCommittees();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-6">
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {t("T-309")}
        </BarraTitulo>
        <p className="max-w-prose text-lg">{t("T-022")}</p>
      </div>
      <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {comites.map((comite, index) => {
          const resumen = excerpt(comite.presentation ?? "", 120);
          return (
            <li key={comite.id}>
              <Link href={`/comites/${comite.slug}`} className="block no-underline">
                <Cartel
                  variante={feedVariant(index)}
                  nivel="h2"
                  titulo={comite.name}
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
