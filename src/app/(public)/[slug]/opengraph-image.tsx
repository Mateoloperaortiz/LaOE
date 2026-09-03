import { excerpt, findPublicPage } from "@/modules/content";
import { OG_CONTENT_TYPE, OG_SIZE, ogResponse, varianteDe } from "@/shared/brand/og";
import { t } from "@/shared/copy";

// Lee la base: nunca se prerrenderiza (ADR-033).
export const dynamic = "force-dynamic";

export const alt = t("T-314", { título: t("T-001") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const SLUG = /^[a-z0-9-]{2,60}$/;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pagina = SLUG.test(slug) ? await findPublicPage(slug) : null;
  if (!pagina) {
    return new Response("No existe", { status: 404 });
  }
  const resumen = pagina.status === "PUBLISHED" ? excerpt(pagina.body, 140) : "";
  return ogResponse({
    variante: varianteDe(pagina.slug),
    eyebrow: t("T-036"),
    titulo: pagina.title,
    ...(resumen ? { subtitulo: resumen } : {}),
    pie: t("T-031"),
  });
}
