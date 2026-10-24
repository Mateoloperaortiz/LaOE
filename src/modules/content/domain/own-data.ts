import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import { mediaAsset } from "../schema";

/** Las fotos que subió el titular, sin objetos del bucket ni archivos institucionales que operó. */
export async function collectOwnMediaData(personId: string) {
  const mediaFiles = await getDb()
    .select({
      id: mediaAsset.id,
      contentType: mediaAsset.contentType,
      byteSize: mediaAsset.byteSize,
      width: mediaAsset.width,
      height: mediaAsset.height,
      status: mediaAsset.status,
      createdAt: mediaAsset.createdAt,
      updatedAt: mediaAsset.updatedAt,
    })
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.uploadedById, personId),
        eq(mediaAsset.visibility, "PRIVATE"),
        sql`starts_with(${mediaAsset.objectKey}, ${`photos/${personId}/`})`,
      ),
    )
    .orderBy(desc(mediaAsset.createdAt), desc(mediaAsset.id))
    .limit(OWN_DATA_QUERY_LIMIT);
  return ownDataCollections({ mediaFiles });
}
