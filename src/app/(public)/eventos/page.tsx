import type { Metadata } from "next";
import { getPublicMediaRef } from "@/modules/content";
import { findNextPublicEditions, listPublishedEvents } from "@/modules/events";
import { BarraTitulo, feedVariant } from "@/shared/brand";
import { t } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { EventoTarjeta } from "../_ui/EventoTarjeta";

export const metadata: Metadata = paginaMetadata({
  title: t("T-304"),
  description: t("T-014"),
  path: "/eventos",
});

// Catálogo de eventos permanentes con su próxima edición pública.
export default async function EventosPage() {
  const eventos = await listPublishedEvents();
  const [proximas, portadas] = await Promise.all([
    findNextPublicEditions(),
    Promise.all(
      eventos.map((evento) =>
        evento.coverAssetId ? getPublicMediaRef(evento.coverAssetId) : Promise.resolve(null),
      ),
    ),
  ]);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-6">
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {t("T-304")}
        </BarraTitulo>
        <p className="max-w-prose text-lg">{t("T-014")}</p>
      </div>
      <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {eventos.map((evento, index) => (
          <li key={evento.id}>
            <EventoTarjeta
              evento={evento}
              proxima={proximas.get(evento.id) ?? null}
              cover={portadas[index] ?? null}
              variante={feedVariant(index)}
              nivel="h2"
            />
          </li>
        ))}
      </ul>
      <p>
        <a href="/api/ics/publico.ics" className="boton-secundario">
          {t("T-308")}
        </a>
      </p>
    </div>
  );
}
