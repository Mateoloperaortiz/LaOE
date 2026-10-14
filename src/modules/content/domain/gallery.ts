import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getObjectStream } from "@/shared/adapters/storage";
import {
  galleryAlbum,
  galleryAlbumPhoto,
  galleryCollection,
  galleryFeaturedPhoto,
  galleryPhoto,
} from "../schema";
import {
  GALLERY_SLUG,
  type GalleryAlbum,
  type GalleryAlbumPage,
  type GalleryCollectionView,
  galleryPagination,
  galleryPhotoView,
  galleryVariant,
} from "./gallery-pure";

// La ruta o página compone sesión y consentimiento. Estas lecturas solo proyectan lo publicado.
function publishedRelation(collectionId: string) {
  return sql<boolean>`exists (
    select 1 from ${galleryAlbumPhoto}
    join ${galleryAlbum} on ${galleryAlbum.id} = ${galleryAlbumPhoto.albumId}
    where ${galleryAlbumPhoto.photoId} = ${galleryPhoto.id}
      and ${galleryAlbum.collectionId} = ${collectionId}
      and ${galleryAlbum.status} = 'PUBLISHED'
  )`;
}

async function albumViews(collectionId: string): Promise<GalleryAlbum[]> {
  const db = getDb();
  const albums = await db
    .select()
    .from(galleryAlbum)
    .where(and(eq(galleryAlbum.collectionId, collectionId), eq(galleryAlbum.status, "PUBLISHED")))
    .orderBy(asc(galleryAlbum.sortOrder), asc(galleryAlbum.id));
  if (albums.length === 0) return [];
  const ids = albums.map((album) => album.id);
  const [totals, covers] = await Promise.all([
    db
      .select({ albumId: galleryAlbumPhoto.albumId, n: count() })
      .from(galleryAlbumPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
      .where(and(inArray(galleryAlbumPhoto.albumId, ids), eq(galleryPhoto.status, "READY")))
      .groupBy(galleryAlbumPhoto.albumId),
    db
      .select({ albumId: galleryAlbumPhoto.albumId, photo: galleryPhoto })
      .from(galleryAlbumPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
      .innerJoin(
        galleryAlbum,
        and(
          eq(galleryAlbum.id, galleryAlbumPhoto.albumId),
          eq(galleryAlbum.coverPhotoId, galleryPhoto.id),
        ),
      )
      .where(and(inArray(galleryAlbumPhoto.albumId, ids), eq(galleryPhoto.status, "READY"))),
  ]);
  const counts = new Map(totals.map((row) => [row.albumId, row.n]));
  const photos = new Map(covers.map((row) => [row.albumId, galleryPhotoView(row.photo)]));
  return albums.map((album) => ({
    id: album.id,
    slug: album.slug,
    title: album.title,
    caption: album.caption,
    cover: photos.get(album.id) ?? null,
    photoCount: counts.get(album.id) ?? 0,
  }));
}

export async function getGalleryCollection(slug: string): Promise<GalleryCollectionView | null> {
  if (!GALLERY_SLUG.test(slug)) return null;
  const db = getDb();
  const [collection] = await db
    .select()
    .from(galleryCollection)
    .where(and(eq(galleryCollection.slug, slug), eq(galleryCollection.status, "PUBLISHED")))
    .limit(1);
  if (!collection) return null;
  const [albums, hero, featured] = await Promise.all([
    albumViews(collection.id),
    collection.heroPhotoId
      ? db
          .select()
          .from(galleryPhoto)
          .where(
            and(
              eq(galleryPhoto.id, collection.heroPhotoId),
              eq(galleryPhoto.status, "READY"),
              publishedRelation(collection.id),
            ),
          )
          .limit(1)
      : [],
    db
      .select({ photo: galleryPhoto })
      .from(galleryFeaturedPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryFeaturedPhoto.photoId))
      .where(
        and(
          eq(galleryFeaturedPhoto.collectionId, collection.id),
          eq(galleryPhoto.status, "READY"),
          publishedRelation(collection.id),
        ),
      )
      .orderBy(asc(galleryFeaturedPhoto.sortOrder), asc(galleryFeaturedPhoto.id))
      .limit(96),
  ]);
  return {
    id: collection.id,
    slug: collection.slug,
    title: collection.title,
    description: collection.description,
    hero: hero[0] ? galleryPhotoView(hero[0]) : null,
    albums,
    featured: featured.map((row) => galleryPhotoView(row.photo)),
  };
}

export async function getGalleryAlbum(
  collectionSlug: string,
  albumSlug: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<GalleryAlbumPage | null> {
  if (!GALLERY_SLUG.test(collectionSlug) || !GALLERY_SLUG.test(albumSlug)) return null;
  const db = getDb();
  const [row] = await db
    .select({ collection: galleryCollection, album: galleryAlbum })
    .from(galleryAlbum)
    .innerJoin(galleryCollection, eq(galleryCollection.id, galleryAlbum.collectionId))
    .where(
      and(
        eq(galleryCollection.slug, collectionSlug),
        eq(galleryCollection.status, "PUBLISHED"),
        eq(galleryAlbum.slug, albumSlug),
        eq(galleryAlbum.status, "PUBLISHED"),
      ),
    )
    .limit(1);
  if (!row) return null;
  const { page, pageSize } = galleryPagination(options);
  const where = and(eq(galleryAlbumPhoto.albumId, row.album.id), eq(galleryPhoto.status, "READY"));
  const [photos, [total], cover] = await Promise.all([
    db
      .select({ photo: galleryPhoto })
      .from(galleryAlbumPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
      .where(where)
      .orderBy(asc(galleryAlbumPhoto.sortOrder), asc(galleryAlbumPhoto.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ n: count() })
      .from(galleryAlbumPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
      .where(where),
    row.album.coverPhotoId
      ? db
          .select({ photo: galleryPhoto })
          .from(galleryAlbumPhoto)
          .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
          .where(and(where, eq(galleryPhoto.id, row.album.coverPhotoId)))
          .limit(1)
      : [],
  ]);
  const photoCount = total?.n ?? 0;
  return {
    id: row.album.id,
    slug: row.album.slug,
    title: row.album.title,
    caption: row.album.caption,
    cover: cover[0] ? galleryPhotoView(cover[0].photo) : null,
    photoCount,
    collectionSlug: row.collection.slug,
    collectionTitle: row.collection.title,
    photos: photos.map((item) => galleryPhotoView(item.photo)),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(photoCount / pageSize)),
  };
}

/** Solo variantes de una foto READY con relación publicada; nunca se firma una URL. */
export async function openGalleryPhoto(id: string, width: number | null, signal?: AbortSignal) {
  const [row] = await getDb()
    .select({ photo: galleryPhoto })
    .from(galleryPhoto)
    .innerJoin(galleryAlbumPhoto, eq(galleryAlbumPhoto.photoId, galleryPhoto.id))
    .innerJoin(galleryAlbum, eq(galleryAlbum.id, galleryAlbumPhoto.albumId))
    .innerJoin(galleryCollection, eq(galleryCollection.id, galleryAlbum.collectionId))
    .where(
      and(
        eq(galleryPhoto.id, id),
        eq(galleryPhoto.status, "READY"),
        eq(galleryAlbum.status, "PUBLISHED"),
        eq(galleryCollection.status, "PUBLISHED"),
      ),
    )
    .limit(1);
  const variant = row ? galleryVariant(row.photo.variants, width) : null;
  if (!variant) return null;
  return getObjectStream(variant.key, signal);
}
