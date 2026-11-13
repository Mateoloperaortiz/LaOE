import type { Metadata } from "next";
import { listPublicAnnouncements } from "@/modules/content";
import { Elemento, feedVariant, SelloOE } from "@/shared/brand";
import { t } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { Afiche } from "../_ui/Afiche";
import { AnuncioCartel } from "../_ui/AnuncioCartel";
import { findOpenAdmission, PortalCierre } from "../_ui/PortalCierre";

export const metadata: Metadata = paginaMetadata({
  title: t("T-301"),
  description: t("T-007"),
  path: "/cartelera",
});

// Cartelera pública: anuncios publicados con audiencia pública, fijados primero (ADR-015).
export default async function CarteleraPage() {
  const [anuncios, admision] = await Promise.all([
    listPublicAnnouncements(60),
    findOpenAdmission(),
  ]);
  return (
    <>
      <Afiche variante="amarillo" titulo={t("T-301")} />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        {anuncios.length === 0 ? (
          <div className="flex flex-col items-start gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-8 textura-granito sm:flex-row sm:items-center sm:gap-10">
            <Elemento tipo="asterisco" className="size-24 shrink-0 text-oe-navy" />
            <div className="flex flex-col gap-4">
              <p className="text-lg">{t("T-302")}</p>
              <SelloOE tamano="sm" />
            </div>
          </div>
        ) : (
          <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {anuncios.map((anuncio, index) => (
              <li key={anuncio.id}>
                <AnuncioCartel anuncio={anuncio} variante={feedVariant(index)} nivel="h2" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <PortalCierre admision={admision} />
    </>
  );
}
