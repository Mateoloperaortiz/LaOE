import { getPublishedEdition } from "@/modules/events";
import { OG_CONTENT_TYPE, OG_SIZE, ogResponse, varianteDe } from "@/shared/brand/og";
import { t } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";

// Lee la base: nunca se prerrenderiza (ADR-033).
export const dynamic = "force-dynamic";

export const alt = t("T-314", { título: t("T-304") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const SLUG = /^[a-z0-9-]{2,60}$/;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; edicion: string }>;
}) {
  const { slug, edicion: edicionSlug } = await params;
  const edicion =
    SLUG.test(slug) && SLUG.test(edicionSlug) ? await getPublishedEdition(slug, edicionSlug) : null;
  if (!edicion) {
    return new Response("No existe", { status: 404 });
  }
  const cuando = formatDateRange(edicion.startsAt, edicion.endsAt);
  return ogResponse({
    variante: varianteDe(edicion.id),
    eyebrow: edicion.event.name,
    titulo: edicion.name,
    subtitulo: edicion.location ? `${cuando} · ${edicion.location}` : cuando,
    pie: t("T-031"),
  });
}
