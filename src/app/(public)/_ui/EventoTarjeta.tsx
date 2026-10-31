import { Imagen, type MediaRef } from "@/modules/content";
import type { PublicEdition, PublicEvent } from "@/modules/events";
import { Cartel, type CartelVariante } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";

type Props = {
  evento: PublicEvent;
  proxima: PublicEdition | null;
  cover: MediaRef | null;
  variante: CartelVariante;
  nivel?: "h2" | "h3";
};

// Tarjeta de un evento: portada si la tiene, cartel tipográfico si no; la próxima edición o
// "Fecha por confirmar". El título es el enlace y un pseudoelemento estira el área clicable.
export function EventoTarjeta({ evento, proxima, cover, variante, nivel = "h3" }: Props) {
  const eyebrow = proxima ? `${t("T-311")} · ${formatDate(proxima.startsAt)}` : t("T-021");
  const Titulo = nivel;
  const enlace = (
    <Link
      href={`/eventos/${evento.slug}`}
      className="text-current no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
    >
      {evento.name}
    </Link>
  );
  if (cover) {
    return (
      <article className="relative flex flex-col gap-3">
        <Imagen
          asset={cover}
          alt={t("T-315", { título: evento.name })}
          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
          className="aspect-video w-full rounded-[var(--radius-cartel)] border border-borde object-cover"
        />
        <p className="eyebrow text-tinta-suave">{eyebrow}</p>
        <Titulo className="text-display-md">{enlace}</Titulo>
        {evento.summary ? <p className="max-w-prose">{evento.summary}</p> : null}
      </article>
    );
  }
  return (
    <Cartel
      variante={variante}
      nivel={nivel}
      eyebrow={eyebrow}
      titulo={enlace}
      {...(evento.summary ? { subtitulo: evento.summary } : {})}
    />
  );
}
