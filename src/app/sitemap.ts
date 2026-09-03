import type { MetadataRoute } from "next";
import { getEnv } from "@/env";
import { listPublicAnnouncements, listPublishedPublicPages } from "@/modules/content";
import { listPublicEditionsForIcs, listPublishedEvents } from "@/modules/events";
import { listPublishedCommittees } from "@/modules/people";

// sitemap.xml (ADR-033): solo lo publicado con audiencia pública. Lee la base: se fuerza dinámico.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const [paginas, anuncios, eventos, ediciones, comites] = await Promise.all([
    listPublishedPublicPages(),
    listPublicAnnouncements(500),
    listPublishedEvents(),
    listPublicEditionsForIcs(),
    listPublishedCommittees(),
  ]);
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/cartelera`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/eventos`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/comites`, changeFrequency: "monthly", priority: 0.7 },
  ];
  for (const pagina of paginas) {
    entries.push({
      url: `${base}/${pagina.slug}`,
      lastModified: pagina.updatedAt,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }
  for (const anuncio of anuncios) {
    entries.push({
      url: `${base}/cartelera/${anuncio.id}`,
      lastModified: anuncio.publishedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }
  for (const evento of eventos) {
    entries.push({
      url: `${base}/eventos/${evento.slug}`,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }
  for (const edicion of ediciones) {
    entries.push({
      url: `${base}/eventos/${edicion.event.slug}/${edicion.slug}`,
      lastModified: edicion.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const comite of comites) {
    entries.push({
      url: `${base}/comites/${comite.slug}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }
  return entries;
}
