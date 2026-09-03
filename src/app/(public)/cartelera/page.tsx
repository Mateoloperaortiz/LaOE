import type { Metadata } from "next";
import { listPublicAnnouncements } from "@/modules/content";
import { BarraTitulo, Elemento, feedVariant, SelloOE } from "@/shared/brand";
import { t } from "@/shared/copy";
import { AnuncioCartel } from "../_ui/AnuncioCartel";

export const metadata: Metadata = { title: t("T-301") };

// Cartelera pública: anuncios publicados con audiencia pública, fijados primero (ADR-015).
export default async function CarteleraPage() {
  const anuncios = await listPublicAnnouncements(60);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <BarraTitulo nivel="h1" color="amarillo" className="self-start">
        {t("T-301")}
      </BarraTitulo>
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
  );
}
