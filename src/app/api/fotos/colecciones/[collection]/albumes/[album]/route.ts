import { getGalleryAlbum } from "@/modules/content";
import { GALLERY_PRIVATE_HEADERS, galleryAccessDenied } from "../../../../_access";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string; album: string }> },
) {
  const denied = await galleryAccessDenied();
  if (denied) return denied;
  const { collection, album } = await params;
  const raw = new URL(request.url).searchParams.get("pagina");
  if (raw !== null && !/^[1-9]\d{0,5}$/.test(raw))
    return new Response(null, { status: 400, headers: GALLERY_PRIVATE_HEADERS });
  const result = await getGalleryAlbum(collection, album, { page: raw === null ? 1 : Number(raw) });
  return result
    ? Response.json(result, { headers: GALLERY_PRIVATE_HEADERS })
    : new Response(null, { status: 404, headers: GALLERY_PRIVATE_HEADERS });
}
