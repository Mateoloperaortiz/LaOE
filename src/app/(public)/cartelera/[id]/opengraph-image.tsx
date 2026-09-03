import { excerpt, getPublicAnnouncement } from "@/modules/content";
import { OG_CONTENT_TYPE, OG_SIZE, ogResponse, varianteDe } from "@/shared/brand/og";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";

// Lee la base: nunca se prerrenderiza (ADR-033).
export const dynamic = "force-dynamic";

export const alt = t("T-314", { título: t("T-301") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const ID = /^[a-z0-9]{10,40}$/;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anuncio = ID.test(id) ? await getPublicAnnouncement(id) : null;
  if (!anuncio) {
    return new Response("No existe", { status: 404 });
  }
  const resumen = excerpt(anuncio.body, 140);
  return ogResponse({
    variante: varianteDe(anuncio.id),
    eyebrow: `${t("T-301")} · ${formatDate(anuncio.publishedAt)}`,
    titulo: anuncio.title,
    ...(resumen ? { subtitulo: resumen } : {}),
    pie: t("T-031"),
  });
}
