import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { excerpt, findPublicPage } from "@/modules/content";
import { listAdmissionPipelineIds } from "@/modules/crm";
import { findOpenProspectForm, findOpenPublicFormForPipelines } from "@/modules/forms";
import { BarraTitulo, Elemento } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { PaginaEditable } from "../_ui/PaginaEditable";

// Páginas fijas y editables del portal (La OE, Unirse, Privacidad y las que el admin cree después).
// Las rutas estáticas (cartelera, eventos, comités) tienen prioridad sobre este segmento.

const SLUG = /^[a-z0-9-]{2,60}$/;

async function cargar(slug: string) {
  if (!SLUG.test(slug)) {
    return null;
  }
  return findPublicPage(slug);
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await cargar(slug);
  if (!pagina) {
    return {};
  }
  return paginaMetadata({
    title: pagina.title,
    description: pagina.status === "PUBLISHED" ? excerpt(pagina.body, 160) : undefined,
    path: `/${pagina.slug}`,
  });
}

function ContactoOE() {
  const contacto = tList("T-013").filter((item) => item !== "redes"); // redes: por confirmar (T-013)
  return (
    <section aria-labelledby="contacto" className="flex flex-col gap-5">
      <BarraTitulo color="amarillo" className="self-start">
        <span id="contacto">{t("T-321")}</span>
      </BarraTitulo>
      <ul className="flex list-none flex-col gap-1 p-0 text-lg">
        {contacto.map((item) => (
          <li key={item}>{item.includes("@") ? <a href={`mailto:${item}`}>{item}</a> : item}</li>
        ))}
      </ul>
    </section>
  );
}

// Unirse (ADR-037 regla 5): "Postulate" hacia el formulario público abierto ligado a un pipeline de
// admisión; sin convocatoria, el texto solo invita a dejar el correo si hay formulario de prospecto.
async function Unirse() {
  const admision = await findOpenPublicFormForPipelines(await listAdmissionPipelineIds());
  const prospecto = admision ? null : await findOpenProspectForm();
  return (
    <section aria-labelledby="postulate" className="flex flex-col gap-5">
      <h2 id="postulate" className="sr-only">
        {t("T-025")}
      </h2>
      {admision ? (
        <Link href={`/f/${admision.slug}`} className="boton-calido self-start">
          {t("T-027")}
        </Link>
      ) : (
        <div className="flex max-w-2xl flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito sm:flex-row sm:items-center sm:gap-6">
          <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
          <div className="flex flex-col items-start gap-4">
            <p className="text-lg">{t(prospecto ? "T-028" : "T-1548")}</p>
            {prospecto ? (
              <Link href={`/f/${prospecto.slug}`} className="boton-secundario shrink-0 self-start">
                {t("T-868")}
              </Link>
            ) : (
              <Link href="/eventos" className="boton-secundario">
                {t("T-317")}
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default async function PaginaPublica({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const pagina = await cargar(slug);
  if (!pagina) {
    notFound();
  }
  return (
    <PaginaEditable pagina={pagina}>
      {slug === "la-oe" ? <ContactoOE /> : null}
      {slug === "unirse" ? <Unirse /> : null}
    </PaginaEditable>
  );
}
