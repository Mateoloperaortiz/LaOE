import { Imagen, type MediaRef } from "@/modules/content";
import type { PublicEdition } from "@/modules/events";
import { TituloAcentuado } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateRange, formatDayMonth } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Afiche, PanelGrafico, SelloRedondo } from "./Afiche";
import type { PortadaMomento } from "./momento";

type Props = {
  momento: PortadaMomento;
  /** El formulario público de admisión abierto, si lo hay: su enlace y hasta cuándo recibe. */
  admision: { slug: string; closesAt: Date | null } | null;
  proximo: PublicEdition | null;
  portadaProximo: MediaRef | null;
};

function selloDesde() {
  const [arriba, grande] = tList("T-5039");
  return <SelloRedondo arriba={arriba} grande={grande} />;
}

/** «Faltan 3 días», «Falta 1 día» o «Es hoy», en el sello del titular. */
function selloCuenta(dias: number) {
  const [faltan, diasPlural, falta, dia, es, hoy] = tList("T-5036");
  if (dias === 0) {
    return <SelloRedondo arriba={es} grande={hoy} color="naranja" posicion="arriba" />;
  }
  return (
    <SelloRedondo
      arriba={dias === 1 ? falta : faltan}
      grande={String(dias)}
      abajo={dias === 1 ? dia : diasPlural}
      color="naranja"
      posicion="arriba"
    />
  );
}

// El titular de la portada (ADR-189 regla 3): la convocatoria abierta, la edición de la semana o el
// lema. El momento lo decide `portadaMomento`; aquí solo se dibuja.
export function PortadaTitular({ momento, admision, proximo, portadaProximo }: Props) {
  if (momento.tipo === "convocatoria" && admision) {
    const [abierta, cierra] = t("T-5034", {
      fecha: admision.closesAt ? formatDate(admision.closesAt) : "",
    }).split(" · ");
    return (
      <Afiche
        variante="navy"
        tamano="portada"
        eyebrow={
          <>
            <span className="portal-afiche-etiqueta">{abierta}</span>
            {admision.closesAt ? <span>{cierra}</span> : null}
          </>
        }
        titulo={
          <TituloAcentuado texto={t("T-025")} acento={2} claseAcento="portal-afiche-acento" />
        }
        bajada={t("T-003")}
        visual={<PanelGrafico elemento="asterisco">{selloDesde()}</PanelGrafico>}
      >
        <div className="portal-afiche-acciones">
          <Link href={`/f/${admision.slug}`} className="boton-calido">
            {t("T-027")}
          </Link>
          <Link href="/comites" className="boton-secundario">
            {t("T-005")}
          </Link>
        </div>
      </Afiche>
    );
  }

  if (momento.tipo === "evento" && proximo) {
    const [estaSemana, verEvento] = tList("T-5035");
    const [cuando, donde] = tList("T-307");
    return (
      <Afiche
        variante="amarillo"
        tamano="portada"
        eyebrow={
          <>
            <span className="portal-afiche-etiqueta">{estaSemana}</span>
            <span>{proximo.event.name}</span>
          </>
        }
        titulo={proximo.name}
        visual={
          <PanelGrafico elemento="estrella">
            {portadaProximo ? (
              <Imagen
                asset={portadaProximo}
                alt={t("T-315", { título: proximo.name })}
                sizes="(min-width: 1024px) 480px, 100vw"
                priority
              />
            ) : null}
            {selloCuenta(momento.dias)}
          </PanelGrafico>
        }
      >
        <p className="portal-afiche-fecha">{formatDayMonth(proximo.startsAt)}</p>
        <dl className="portal-afiche-ficha">
          <dt>{cuando}</dt>
          <dd>{formatDateRange(proximo.startsAt, proximo.endsAt)}</dd>
          {proximo.location ? (
            <>
              <dt>{donde}</dt>
              <dd>{proximo.location}</dd>
            </>
          ) : null}
        </dl>
        <div className="portal-afiche-acciones">
          <Link href={`/eventos/${proximo.event.slug}/${proximo.slug}`} className="boton-primario">
            {verEvento}
          </Link>
          <Link href="/eventos" className="boton-secundario">
            {t("T-317")}
          </Link>
        </div>
      </Afiche>
    );
  }

  return (
    <Afiche
      variante="paper"
      tamano="portada"
      eyebrow={t("T-036")}
      titulo={<TituloAcentuado texto={t("T-002")} acento={2} claseAcento="portal-afiche-acento" />}
      bajada={t("T-003")}
      visual={<PanelGrafico elemento="bucle-doble">{selloDesde()}</PanelGrafico>}
    >
      <div className="portal-afiche-acciones">
        <Link href="/unirse" className="boton-calido">
          {t("T-1543")}
        </Link>
        <Link href="/comites" className="boton-secundario">
          {t("T-005")}
        </Link>
      </div>
    </Afiche>
  );
}
