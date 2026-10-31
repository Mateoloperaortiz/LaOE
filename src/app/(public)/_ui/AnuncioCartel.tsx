import { excerpt, type PublicAnnouncement } from "@/modules/content";
import { Cartel, type CartelVariante } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";

type Props = {
  anuncio: PublicAnnouncement;
  variante: CartelVariante;
  nivel?: "h2" | "h3";
};

// Tarjeta de la cartelera: cartel tipográfico con fecha, marca de fijado, título enlazado y resumen.
export function AnuncioCartel({ anuncio, variante, nivel = "h3" }: Props) {
  const resumen = excerpt(anuncio.body, 180);
  return (
    <Cartel
      variante={variante}
      nivel={nivel}
      isotipo={false}
      eyebrow={
        <>
          {t("T-313", { fecha: formatDate(anuncio.publishedAt) })}
          {anuncio.pinned ? ` · ${t("T-303")}` : null}
        </>
      }
      titulo={
        <Link
          href={`/cartelera/${anuncio.id}`}
          className="text-current no-underline hover:underline"
        >
          {anuncio.title}
        </Link>
      }
      {...(resumen ? { subtitulo: resumen } : {})}
    />
  );
}
