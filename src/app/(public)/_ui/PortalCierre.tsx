import { listAdmissionPipelineIds } from "@/modules/crm";
import { findOpenPublicFormForPipelines } from "@/modules/forms";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

/** El formulario público de admisión abierto, si lo hay (ADR-037 regla 5). */
export function findOpenAdmission() {
  return listAdmissionPipelineIds().then(findOpenPublicFormForPipelines);
}

type Props = {
  admision: { slug: string } | null;
  /** El lema, cuando el titular de la página ya hizo la invitación. */
  lema?: boolean;
};

// El cierre de una página del portal (ADR-189 regla 4): repite la acción principal, que es postularse
// si hay convocatoria abierta y, si no, conocer cómo unirse.
export function PortalCierre({ admision, lema = false }: Props) {
  return (
    <section
      aria-labelledby="portal-cierre"
      className="cartel portal-afiche portal-cierre"
      data-variante="amarillo"
    >
      <div className="portal-afiche-inner">
        <div className="portal-afiche-texto">
          <h2 id="portal-cierre">{t(lema ? "T-002" : "T-025")}</h2>
          <div className="portal-afiche-acciones">
            <Link href={admision ? `/f/${admision.slug}` : "/unirse"} className="boton-primario">
              {t(admision ? "T-027" : "T-1543")}
            </Link>
            <Link href="/comites" className="boton-secundario">
              {t("T-005")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
