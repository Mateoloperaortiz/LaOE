import { excerpt } from "@/modules/content";
import { getPublishedCommittee } from "@/modules/people";
import { OG_CONTENT_TYPE, OG_SIZE, ogResponse, varianteDe } from "@/shared/brand/og";
import { t } from "@/shared/copy";

// Lee la base: nunca se prerrenderiza (ADR-033).
export const dynamic = "force-dynamic";

export const alt = t("T-314", { título: t("T-309") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const SLUG = /^[a-z0-9-]{2,40}$/;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comite = SLUG.test(slug) ? await getPublishedCommittee(slug) : null;
  if (!comite) {
    return new Response("No existe", { status: 404 });
  }
  const resumen = excerpt(comite.presentation ?? "", 140);
  return ogResponse({
    variante: varianteDe(comite.slug),
    eyebrow: t("T-309"),
    titulo: comite.name,
    ...(resumen ? { subtitulo: resumen } : {}),
    pie: t("T-031"),
  });
}
