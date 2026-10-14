import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import {
  galleryAlbum,
  galleryAlbumPhoto,
  galleryCollection,
  galleryFeaturedPhoto,
  galleryPhoto,
} from "@/modules/content/schema";
import { putObject } from "@/shared/adapters/storage";

/** Fotos geométricas sintéticas, compartidas por integración y E2E; ninguna fotografía real. */
export async function seedSyntheticGallery(
  options: { slug?: string; photoCount?: number; published?: boolean; actorId?: string } = {},
) {
  const slug = options.slug ?? "galeria-prueba";
  const status = options.published === false ? "DRAFT" : "PUBLISHED";
  const [collection] = await getDb()
    .insert(galleryCollection)
    .values({ slug, title: "Galería de prueba", description: "Colección sintética", status })
    .returning({ id: galleryCollection.id });
  if (!collection) throw new Error("seed gallery collection");
  const [album] = await getDb()
    .insert(galleryAlbum)
    .values({
      collectionId: collection.id,
      slug: "momentos",
      title: "Momentos de prueba",
      caption: "Fotos sintéticas",
      status,
    })
    .returning({ id: galleryAlbum.id });
  if (!album) throw new Error("seed gallery album");
  const photoIds: string[] = [];
  const keys: string[] = [];
  for (let index = 0; index < (options.photoCount ?? 3); index++) {
    const width = 1200;
    const height = 800;
    const sourceHash = createHash("sha256").update(randomUUID()).digest("hex");
    const variants: Record<
      string,
      { key: string; width: number; height: number; byteSize: number; contentType: string }
    > = {};
    for (const size of [480, 960, 1200]) {
      const data = await sharp({
        create: {
          width: size,
          height: Math.round((height * size) / width),
          channels: 3,
          background: { r: 25 + ((index * 9) % 220), g: 65, b: 120 },
        },
      })
        .webp()
        .toBuffer();
      const key = `fotos/${slug}/${sourceHash}/w${size}.webp`;
      await putObject(key, data, "image/webp");
      keys.push(key);
      variants[`w${size}`] = {
        key,
        width: size,
        height: Math.round((height * size) / width),
        byteSize: data.byteLength,
        contentType: "image/webp",
      };
    }
    const [photo] = await getDb()
      .insert(galleryPhoto)
      .values({
        sourceHash,
        width,
        height,
        alt: `Imagen geométrica ${index + 1}`,
        variants,
        status: "READY",
        uploadedById: options.actorId ?? null,
      })
      .returning({ id: galleryPhoto.id });
    if (!photo) throw new Error("seed gallery photo");
    photoIds.push(photo.id);
    await getDb()
      .insert(galleryAlbumPhoto)
      .values({ albumId: album.id, photoId: photo.id, sortOrder: index });
  }
  const first = photoIds[0];
  if (first) {
    await getDb()
      .update(galleryCollection)
      .set({ heroPhotoId: first })
      .where(eq(galleryCollection.id, collection.id));
    await getDb()
      .update(galleryAlbum)
      .set({ coverPhotoId: first })
      .where(eq(galleryAlbum.id, album.id));
    await getDb()
      .insert(galleryFeaturedPhoto)
      .values({ collectionId: collection.id, photoId: first });
  }
  return { collectionId: collection.id, albumId: album.id, albumSlug: "momentos", photoIds, keys };
}
