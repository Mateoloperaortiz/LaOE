import { getPublishedEvent } from "@/modules/events";
import { OG_CONTENT_TYPE, OG_SIZE, ogResponse, varianteDe } from "@/shared/brand/og";
import { t } from "@/shared/copy";

// Lee la base: nunca se prerrenderiza (ADR-033).
export const dynamic = "force-dynamic";

export const alt = t("T-314", { título: t("T-304") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const SLUG = /^[a-z0-9-]{2,60}$/;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const evento = SLUG.test(slug) ? await getPublishedEvent(slug) : null;
  if (!evento) {
    return new Response("No existe", { status: 404 });
  }
  return ogResponse({
    variante: varianteDe(evento.slug),
    eyebrow: t("T-304"),
    titulo: evento.name,
    ...(evento.summary ? { subtitulo: evento.summary } : {}),
    pie: t("T-031"),
  });
}
