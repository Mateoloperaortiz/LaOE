import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getGalleryAlbum } from "@/modules/content";
import { requireActor } from "@/modules/identity";
import { hasLiveConsent } from "@/modules/people";
import { t } from "@/shared/copy";
import { GalleryAlbum } from "../../GalleryAlbum";

// El título de metadata queda genérico: los nombres de los álbumes privados solo se leen
// después del guard de sesión y consentimiento de la página.
export const metadata: Metadata = { title: t("T-3270") };

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ collectionSlug: string; albumSlug: string }>;
}) {
  const { collectionSlug, albumSlug } = await params;
  const path = `/app/fotos/${encodeURIComponent(collectionSlug)}/${encodeURIComponent(albumSlug)}`;
  const actor = await requireActor(path);
  if (!(await hasLiveConsent(actor.personId, "MEMBERSHIP"))) redirect("/autorizacion");
  const album = await getGalleryAlbum(collectionSlug, albumSlug, { page: 1, pageSize: 48 });
  if (!album) notFound();
  return <GalleryAlbum key={album.id} album={album} />;
}
