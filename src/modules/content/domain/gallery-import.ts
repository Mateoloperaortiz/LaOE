import { and, asc, count, countDistinct, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type CommandContext, runCommand } from "@/db/tx";
import { headObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  galleryAlbum,
  galleryAlbumPhoto,
  galleryCollection,
  galleryFeaturedPhoto,
  galleryPhoto,
  type MediaVariants,
} from "../schema";
import { GALLERY_HASH, GALLERY_SLUG, validGalleryVariants } from "./gallery-pure";

/** El CLI resuelve identidad y permisos; content conserva el guard sin crear un ciclo entre módulos. */
export interface GalleryAdminActor {
  personId: string;
  ip: string | null;
  isAdmin: boolean;
  membershipStatus: string;
}

function assertGalleryAdmin(actor: GalleryAdminActor) {
  if (
    !actor.isAdmin ||
    !actor.personId ||
    !["ACTIVE", "HONORARY"].includes(actor.membershipStatus)
  ) {
    throw new DomainError(t("T-3300"));
  }
}

const slug = z.string().max(100).regex(GALLERY_SLUG);
const sourceHash = z.string().regex(GALLERY_HASH);
const identifier = z.string().regex(/^[a-z0-9]{10,40}$/);
const collectionSchema = z.object({
  slug,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
});
const albumSchema = z.object({
  collectionId: identifier,
  slug,
  title: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(300),
  sortOrder: z.number().int().nonnegative(),
});
const variantSchema = z.object({
  key: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().positive(),
  contentType: z.literal("image/webp"),
});
const photoSchema = z.object({
  collectionId: identifier,
  sourceHash,
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  alt: z.string().trim().min(1).max(500),
  variants: z.record(z.string(), variantSchema),
  albums: z
    .array(z.object({ slug, sortOrder: z.number().int().nonnegative() }))
    .min(1)
    .max(100),
});
const selectionSchema = z.object({
  collectionId: identifier,
  heroSourceHash: sourceHash,
  albumCovers: z.record(slug, sourceHash),
  featuredSourceHashes: z.array(sourceHash).max(96),
});
const publishSchema = z.object({
  collectionId: identifier,
  expectedAlbumCounts: z.record(slug, z.number().int().positive()),
  expectedPhotoCount: z.number().int().positive(),
  expectedFeaturedCount: z.number().int().nonnegative().max(96),
});

async function lockCollection(ctx: CommandContext, id: string) {
  const [row] = await ctx.tx
    .select()
    .from(galleryCollection)
    .where(eq(galleryCollection.id, id))
    .for("update")
    .limit(1);
  if (!row) throw new DomainError(t("T-3301"));
  return row;
}

export async function upsertGalleryCollectionAs(
  actor: GalleryAdminActor,
  input: z.infer<typeof collectionSchema>,
) {
  assertGalleryAdmin(actor);
  const data = collectionSchema.parse(input);
  return runCommand(actor, async (ctx) => {
    const [row] = await ctx.tx
      .insert(galleryCollection)
      .values(data)
      .onConflictDoNothing({ target: galleryCollection.slug })
      .returning({ id: galleryCollection.id });
    let saved = row;
    if (!saved) {
      const [existing] = await ctx.tx
        .select()
        .from(galleryCollection)
        .where(eq(galleryCollection.slug, data.slug))
        .for("update")
        .limit(1);
      if (!existing) throw new Error("gallery_collection: upsert sin resultado");
      if (existing.status === "PUBLISHED") {
        if (existing.title !== data.title || existing.description !== data.description)
          throw new DomainError(t("T-3307"));
        return { id: existing.id };
      }
      await ctx.tx
        .update(galleryCollection)
        .set({ title: data.title, description: data.description })
        .where(eq(galleryCollection.id, existing.id));
      saved = { id: existing.id };
    }
    await ctx.audit({
      action: "gallery.collection-upserted",
      entityType: "gallery_collection",
      entityId: saved.id,
      after: data,
    });
    return saved;
  });
}

export async function upsertGalleryAlbumAs(
  actor: GalleryAdminActor,
  input: z.infer<typeof albumSchema>,
) {
  assertGalleryAdmin(actor);
  const data = albumSchema.parse(input);
  return runCommand(actor, async (ctx) => {
    const collection = await lockCollection(ctx, data.collectionId);
    const [existing] = await ctx.tx
      .select()
      .from(galleryAlbum)
      .where(
        and(eq(galleryAlbum.collectionId, data.collectionId), eq(galleryAlbum.slug, data.slug)),
      )
      .limit(1);
    if (collection.status === "PUBLISHED" || existing?.status === "PUBLISHED") {
      if (
        !existing ||
        existing.title !== data.title ||
        existing.caption !== data.caption ||
        existing.sortOrder !== data.sortOrder
      )
        throw new DomainError(t("T-3307"));
      return { id: existing.id };
    }
    const [row] = await ctx.tx
      .insert(galleryAlbum)
      .values(data)
      .onConflictDoUpdate({
        target: [galleryAlbum.collectionId, galleryAlbum.slug],
        set: { title: data.title, caption: data.caption, sortOrder: data.sortOrder },
      })
      .returning({ id: galleryAlbum.id });
    if (!row) throw new Error("gallery_album: upsert sin resultado");
    await ctx.audit({
      action: "gallery.album-upserted",
      entityType: "gallery_album",
      entityId: row.id,
      after: data,
    });
    return row;
  });
}

/** La colección opcional permite acreditar una reanudación sin escribir ni auditar la comparación. */
export async function findGalleryPhotoForImportAs(
  actor: GalleryAdminActor,
  hash: string,
  collectionId?: string,
) {
  assertGalleryAdmin(actor);
  sourceHash.parse(hash);
  if (collectionId !== undefined) identifier.parse(collectionId);
  const db = getDb();
  const columns = {
    id: galleryPhoto.id,
    width: galleryPhoto.width,
    height: galleryPhoto.height,
    alt: galleryPhoto.alt,
    variants: galleryPhoto.variants,
  };
  const ready = and(eq(galleryPhoto.sourceHash, hash), eq(galleryPhoto.status, "READY"));
  if (collectionId === undefined) {
    const [row] = await db.select(columns).from(galleryPhoto).where(ready).limit(1);
    return row ? { ...row, albums: null } : null;
  }
  // Una sola lectura acredita foto y relaciones del mismo snapshot, sin otra ida a la base.
  const scoped = db
    .select({
      photoId: galleryAlbumPhoto.photoId,
      slug: galleryAlbum.slug,
      sortOrder: galleryAlbumPhoto.sortOrder,
    })
    .from(galleryAlbumPhoto)
    .innerJoin(galleryAlbum, eq(galleryAlbum.id, galleryAlbumPhoto.albumId))
    .where(eq(galleryAlbum.collectionId, collectionId))
    .as("import_album_relations");
  const rows = await db
    .select({ ...columns, albumSlug: scoped.slug, albumSortOrder: scoped.sortOrder })
    .from(galleryPhoto)
    .leftJoin(scoped, eq(scoped.photoId, galleryPhoto.id))
    .where(ready)
    .orderBy(asc(scoped.slug));
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    alt: row.alt,
    variants: row.variants,
    albums: rows.flatMap(({ albumSlug, albumSortOrder }) =>
      albumSlug !== null && albumSortOrder !== null
        ? [{ slug: albumSlug, sortOrder: albumSortOrder }]
        : [],
    ),
  };
}

export async function registerGalleryPhotoAs(
  actor: GalleryAdminActor,
  input: z.infer<typeof photoSchema>,
): Promise<{ id: string; created: boolean }> {
  assertGalleryAdmin(actor);
  const data = photoSchema.parse(input);
  const [collection] = await getDb()
    .select({ slug: galleryCollection.slug, status: galleryCollection.status })
    .from(galleryCollection)
    .where(eq(galleryCollection.id, data.collectionId))
    .limit(1);
  if (!collection) throw new DomainError(t("T-3301"));
  const existing = await findGalleryPhotoForImportAs(actor, data.sourceHash);
  if (collection.status === "PUBLISHED" && !existing) throw new DomainError(t("T-3307"));
  if (!existing) {
    if (
      !validGalleryVariants(
        data.variants,
        data.sourceHash,
        collection.slug,
        data.width,
        data.height,
      )
    )
      throw new DomainError(t("T-3304"));
    // I/O fuera de la transacción. Solo el importador autorizado escribe estas claves deterministas.
    for (const variant of Object.values(data.variants)) {
      const stored = await headObject(variant.key);
      if (!stored || stored.contentType !== "image/webp" || stored.byteSize !== variant.byteSize)
        throw new DomainError(t("T-3304"));
    }
  } else if (existing.width !== data.width || existing.height !== data.height) {
    throw new DomainError(t(collection.status === "PUBLISHED" ? "T-3307" : "T-3304"));
  }
  return runCommand(actor, async (ctx) => {
    const currentCollection = await lockCollection(ctx, data.collectionId);
    const albums = await ctx.tx
      .select({ id: galleryAlbum.id, slug: galleryAlbum.slug, status: galleryAlbum.status })
      .from(galleryAlbum)
      .where(
        and(
          eq(galleryAlbum.collectionId, data.collectionId),
          inArray(
            galleryAlbum.slug,
            data.albums.map((album) => album.slug),
          ),
        ),
      );
    if (albums.length !== new Set(data.albums.map((album) => album.slug)).size)
      throw new DomainError(t(currentCollection.status === "PUBLISHED" ? "T-3307" : "T-3306"));
    const orders = new Map(data.albums.map((album) => [album.slug, album.sortOrder]));
    if (
      currentCollection.status === "PUBLISHED" ||
      albums.some((album) => album.status === "PUBLISHED")
    ) {
      const [photo] = await ctx.tx
        .select()
        .from(galleryPhoto)
        .where(and(eq(galleryPhoto.sourceHash, data.sourceHash), eq(galleryPhoto.status, "READY")))
        .limit(1);
      if (
        !photo ||
        photo.width !== data.width ||
        photo.height !== data.height ||
        photo.alt !== data.alt ||
        !sameVariants(photo.variants, data.variants)
      )
        throw new DomainError(t("T-3307"));
      const relations = await ctx.tx
        .select({ albumId: galleryAlbumPhoto.albumId, sortOrder: galleryAlbumPhoto.sortOrder })
        .from(galleryAlbumPhoto)
        .where(
          and(
            eq(galleryAlbumPhoto.photoId, photo.id),
            inArray(
              galleryAlbumPhoto.albumId,
              albums.map((album) => album.id),
            ),
          ),
        );
      const relationOrders = new Map(
        relations.map((relation) => [relation.albumId, relation.sortOrder]),
      );
      if (
        albums.some(
          (album) =>
            (currentCollection.status === "PUBLISHED" || album.status === "PUBLISHED") &&
            relationOrders.get(album.id) !== orders.get(album.slug),
        )
      )
        throw new DomainError(t("T-3307"));
      if (currentCollection.status === "PUBLISHED") return { id: photo.id, created: false };
    }
    const [inserted] = await ctx.tx
      .insert(galleryPhoto)
      .values({
        sourceHash: data.sourceHash,
        width: data.width,
        height: data.height,
        alt: data.alt,
        variants: data.variants,
        status: "READY",
        uploadedById: actor.personId,
      })
      .onConflictDoNothing({ target: galleryPhoto.sourceHash })
      .returning({ id: galleryPhoto.id });
    const [saved] = inserted
      ? [inserted]
      : await ctx.tx
          .select({ id: galleryPhoto.id })
          .from(galleryPhoto)
          .where(
            and(eq(galleryPhoto.sourceHash, data.sourceHash), eq(galleryPhoto.status, "READY")),
          )
          .limit(1);
    if (!saved) throw new DomainError(t("T-3304"));
    for (const album of albums) {
      if (album.status === "PUBLISHED") continue;
      const sortOrder = orders.get(album.slug) ?? 0;
      await ctx.tx
        .insert(galleryAlbumPhoto)
        .values({ albumId: album.id, photoId: saved.id, sortOrder })
        .onConflictDoUpdate({
          target: [galleryAlbumPhoto.albumId, galleryAlbumPhoto.photoId],
          set: { sortOrder },
        });
    }
    await ctx.audit({
      action: "gallery.photo-registered",
      entityType: "gallery_photo",
      entityId: saved.id,
      after: {
        collectionId: data.collectionId,
        sourceHash: data.sourceHash,
        albums: data.albums,
        created: Boolean(inserted),
      },
    });
    return { id: saved.id, created: Boolean(inserted) };
  });
}

function sameVariants(left: MediaVariants, right: MediaVariants): boolean {
  const names = Object.keys(left);
  return (
    names.length === Object.keys(right).length &&
    names.every((name) => {
      const a = left[name];
      const b = right[name];
      return (
        a !== undefined &&
        b !== undefined &&
        a.key === b.key &&
        a.width === b.width &&
        a.height === b.height &&
        a.byteSize === b.byteSize &&
        a.contentType === b.contentType
      );
    })
  );
}

async function collectionPhotos(ctx: CommandContext, collectionId: string) {
  return ctx.tx
    .select({
      id: galleryPhoto.id,
      hash: galleryPhoto.sourceHash,
      albumId: galleryAlbum.id,
      albumSlug: galleryAlbum.slug,
    })
    .from(galleryAlbumPhoto)
    .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
    .innerJoin(galleryAlbum, eq(galleryAlbum.id, galleryAlbumPhoto.albumId))
    .where(and(eq(galleryAlbum.collectionId, collectionId), eq(galleryPhoto.status, "READY")));
}

export async function configureGalleryCollectionAs(
  actor: GalleryAdminActor,
  input: z.infer<typeof selectionSchema>,
) {
  assertGalleryAdmin(actor);
  const data = selectionSchema.parse(input);
  return runCommand(actor, async (ctx) => {
    const collection = await lockCollection(ctx, data.collectionId);
    const photos = await collectionPhotos(ctx, data.collectionId);
    const byHash = new Map(photos.map((photo) => [photo.hash, photo.id]));
    const heroPhotoId = byHash.get(data.heroSourceHash);
    if (
      !heroPhotoId ||
      data.featuredSourceHashes.some((hash) => !byHash.has(hash)) ||
      new Set(data.featuredSourceHashes).size !== data.featuredSourceHashes.length
    )
      throw new DomainError(t(collection.status === "PUBLISHED" ? "T-3307" : "T-3302"));
    const albums = await ctx.tx
      .select()
      .from(galleryAlbum)
      .where(eq(galleryAlbum.collectionId, data.collectionId));
    const currentFeatured = await ctx.tx
      .select({ photoId: galleryFeaturedPhoto.photoId })
      .from(galleryFeaturedPhoto)
      .where(eq(galleryFeaturedPhoto.collectionId, data.collectionId))
      .orderBy(asc(galleryFeaturedPhoto.sortOrder), asc(galleryFeaturedPhoto.id));
    if (
      collection.status === "PUBLISHED" &&
      (collection.heroPhotoId !== heroPhotoId ||
        currentFeatured.length !== data.featuredSourceHashes.length ||
        currentFeatured.some(
          (photo, index) => photo.photoId !== byHash.get(data.featuredSourceHashes[index] ?? ""),
        ))
    )
      throw new DomainError(t("T-3307"));
    for (const [albumSlug, hash] of Object.entries(data.albumCovers)) {
      const photo = photos.find((item) => item.albumSlug === albumSlug && item.hash === hash);
      if (!photo) throw new DomainError(t(collection.status === "PUBLISHED" ? "T-3307" : "T-3303"));
      const album = albums.find((item) => item.id === photo.albumId);
      if (collection.status === "PUBLISHED" || album?.status === "PUBLISHED") {
        if (album?.coverPhotoId !== photo.id) throw new DomainError(t("T-3307"));
        continue;
      }
      await ctx.tx
        .update(galleryAlbum)
        .set({ coverPhotoId: photo.id })
        .where(eq(galleryAlbum.id, photo.albumId));
    }
    if (collection.status === "PUBLISHED") return;
    await ctx.tx
      .update(galleryCollection)
      .set({ heroPhotoId })
      .where(eq(galleryCollection.id, data.collectionId));
    await ctx.tx
      .delete(galleryFeaturedPhoto)
      .where(eq(galleryFeaturedPhoto.collectionId, data.collectionId));
    if (data.featuredSourceHashes.length > 0)
      await ctx.tx.insert(galleryFeaturedPhoto).values(
        data.featuredSourceHashes.map((hash, sortOrder) => ({
          collectionId: data.collectionId,
          photoId: byHash.get(hash) ?? "",
          sortOrder,
        })),
      );
    await ctx.audit({
      action: "gallery.selection-configured",
      entityType: "gallery_collection",
      entityId: data.collectionId,
      after: data,
    });
  });
}

export async function publishGalleryCollectionAs(
  actor: GalleryAdminActor,
  input: z.infer<typeof publishSchema>,
) {
  assertGalleryAdmin(actor);
  const data = publishSchema.parse(input);
  return runCommand(actor, async (ctx) => {
    const collection = await lockCollection(ctx, data.collectionId);
    const albums = await ctx.tx
      .select()
      .from(galleryAlbum)
      .where(eq(galleryAlbum.collectionId, data.collectionId));
    const photos = await collectionPhotos(ctx, data.collectionId);
    const [totals] = await ctx.tx
      .select({ n: countDistinct(galleryPhoto.id) })
      .from(galleryAlbumPhoto)
      .innerJoin(galleryPhoto, eq(galleryPhoto.id, galleryAlbumPhoto.photoId))
      .innerJoin(galleryAlbum, eq(galleryAlbum.id, galleryAlbumPhoto.albumId))
      .where(
        and(eq(galleryAlbum.collectionId, data.collectionId), eq(galleryPhoto.status, "READY")),
      );
    const [featured] = await ctx.tx
      .select({ n: count() })
      .from(galleryFeaturedPhoto)
      .where(eq(galleryFeaturedPhoto.collectionId, data.collectionId));
    const counts = new Map<string, number>();
    for (const photo of photos) counts.set(photo.albumId, (counts.get(photo.albumId) ?? 0) + 1);
    const ids = new Set(photos.map((photo) => photo.id));
    const featuredRows = await ctx.tx
      .select({ photoId: galleryFeaturedPhoto.photoId })
      .from(galleryFeaturedPhoto)
      .where(eq(galleryFeaturedPhoto.collectionId, data.collectionId));
    const invalid =
      albums.length === 0 ||
      albums.length !== Object.keys(data.expectedAlbumCounts).length ||
      albums.some(
        (album) =>
          !album.coverPhotoId ||
          !photos.some((photo) => photo.albumId === album.id && photo.id === album.coverPhotoId) ||
          counts.get(album.id) !== data.expectedAlbumCounts[album.slug],
      ) ||
      !collection.heroPhotoId ||
      !ids.has(collection.heroPhotoId) ||
      totals?.n !== data.expectedPhotoCount ||
      featured?.n !== data.expectedFeaturedCount ||
      featuredRows.some((photo) => !ids.has(photo.photoId));
    if (invalid) throw new DomainError(t(collection.status === "PUBLISHED" ? "T-3307" : "T-3305"));
    if (collection.status === "PUBLISHED") {
      if (albums.some((album) => album.status !== "PUBLISHED")) throw new DomainError(t("T-3307"));
      return;
    }
    await ctx.tx
      .update(galleryAlbum)
      .set({ status: "PUBLISHED" })
      .where(eq(galleryAlbum.collectionId, data.collectionId));
    await ctx.tx
      .update(galleryCollection)
      .set({ status: "PUBLISHED" })
      .where(eq(galleryCollection.id, data.collectionId));
    await ctx.audit({
      action: "gallery.collection-published",
      entityType: "gallery_collection",
      entityId: data.collectionId,
      before: { status: collection.status },
      after: data,
    });
  });
}
