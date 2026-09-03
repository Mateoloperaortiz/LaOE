import Link from "next/link";
import type { PublicEdition } from "@/modules/events";
import { Insignia } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";

type Props = {
  edicion: PublicEdition;
  now: Date;
  /** Muestra el nombre del evento (en el inicio); en la página del evento sobra. */
  conEvento?: boolean;
};

/** Ya pasó cuando terminó (o empezó, si no tiene fin). */
export function edicionPasada(edicion: PublicEdition, now: Date): boolean {
  return (edicion.endsAt ?? edicion.startsAt).getTime() < now.getTime();
}

// Tarjeta de una edición: el título es el enlace y un pseudoelemento estira el área clicable a toda
// la tarjeta, así el enlace conserva su nombre accesible (el nombre de la edición).
export function EdicionTarjeta({ edicion, now, conEvento = false }: Props) {
  const pasada = edicionPasada(edicion, now);
  const [cuando, donde] = t("T-307")
    .split("·")
    .map((item) => item.trim());
  return (
    <article className="relative flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-5 textura-granito transition-colors hover:bg-fondo-alterno">
      <div className="flex flex-wrap items-center gap-2">
        {conEvento ? <p className="eyebrow text-tinta-suave">{edicion.event.name}</p> : null}
        <Insignia fondo={pasada ? "paper" : "amarillo"}>
          {pasada ? t("T-312") : t("T-311")}
        </Insignia>
      </div>
      <h3 className="text-titulo-lg">
        <Link
          href={`/eventos/${edicion.event.slug}/${edicion.slug}`}
          className="text-current no-underline after:absolute after:inset-0 after:content-[''] hover:underline"
        >
          {edicion.name}
        </Link>
      </h3>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="eyebrow text-xs text-tinta-suave">{cuando}</dt>
        <dd>{formatDateRange(edicion.startsAt, edicion.endsAt)}</dd>
        {edicion.location ? (
          <>
            <dt className="eyebrow text-xs text-tinta-suave">{donde}</dt>
            <dd>{edicion.location}</dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}
