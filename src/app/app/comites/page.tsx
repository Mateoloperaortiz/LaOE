import type { Metadata } from "next";
import Link from "next/link";
import { excerpt } from "@/modules/content";
import { requireActor } from "@/modules/identity";
import { getMyMembership, listInternalCommittees } from "@/modules/people";
import { BarraTitulo, Cartel, feedVariant } from "@/shared/brand";
import { t } from "@/shared/copy";
import { cargoEnComite } from "../_ui/PersonaTarjeta";
import { Vacio } from "../_ui/Vacio";

// Comités internos (06-mapa-del-sitio.md): los propios primero, después los demás; todos activos,
// publicados o no. Cada uno lleva a su roster del semestre.

export const metadata: Metadata = { title: t("T-309") };

export default async function ComitesInternosPage() {
  const actor = await requireActor("/app/comites");
  const [mine, all] = await Promise.all([
    getMyMembership(actor.personId),
    listInternalCommittees(),
  ]);
  const mineIds = new Set(mine.committees.map((item) => item.committeeId));
  const others = all.filter((item) => !mineIds.has(item.id));
  const tarjeta = (
    item: {
      id: string;
      slug: string;
      name: string;
      logoKey: string | null;
      presentation: string | null;
    },
    index: number,
    subtitulo?: string,
  ) => {
    const resumen = subtitulo ?? excerpt(item.presentation ?? "", 120);
    return (
      <li key={item.id}>
        <Link href={`/app/comites/${item.slug}`} className="block no-underline">
          <Cartel
            variante={feedVariant(index)}
            nivel="h3"
            titulo={item.name}
            isotipo={!item.logoKey}
            {...(item.logoKey ? { comite: { slug: item.logoKey, name: item.name } } : {})}
            {...(resumen ? { subtitulo: resumen } : {})}
          />
        </Link>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-309")}</h1>
        <p className="max-w-prose text-lg">{t("T-073")}</p>
      </header>
      <section aria-labelledby="tus-comites" className="flex flex-col gap-6">
        <BarraTitulo color="azul" className="self-start">
          <span id="tus-comites">{t("T-375")}</span>
        </BarraTitulo>
        {mine.committees.length === 0 ? (
          <Vacio texto={t("T-376")} elemento="asterisco" color="text-oe-navy" />
        ) : (
          <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {mine.committees.map((item, index) => {
              const found = all.find((committee) => committee.id === item.committeeId);
              return tarjeta(
                {
                  id: item.committeeId,
                  slug: item.committeeSlug,
                  name: item.committeeName,
                  logoKey: found?.logoKey ?? null,
                  presentation: found?.presentation ?? null,
                },
                index,
                cargoEnComite(item.roleLabel, item.committeeName),
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="los-demas" className="flex flex-col gap-6">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="los-demas">{t("T-382")}</span>
        </BarraTitulo>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((item, index) => tarjeta(item, index + mine.committees.length))}
        </ul>
      </section>
    </div>
  );
}
