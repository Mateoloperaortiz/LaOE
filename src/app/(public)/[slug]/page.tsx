import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { excerpt, findPublicPage } from "@/modules/content";
import { BarraTitulo } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
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

export default async function PaginaPublica({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const pagina = await cargar(slug);
  if (!pagina) {
    notFound();
  }
  return (
    <PaginaEditable pagina={pagina}>{slug === "la-oe" ? <ContactoOE /> : null}</PaginaEditable>
  );
}
