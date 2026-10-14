import { openGalleryPhoto } from "@/modules/content";
import { GALLERY_PRIVATE_HEADERS, galleryAccessDenied } from "../_access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ADR-130: cada petición vuelve a autorizar; la URL del bucket nunca viaja al navegador. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await galleryAccessDenied();
  if (denied) return denied;
  const { id } = await params;
  const raw = new URL(request.url).searchParams.get("w");
  if (!/^[a-z0-9]{10,40}$/.test(id) || (raw !== null && !/^[1-9]\d{0,3}$/.test(raw))) {
    return new Response(null, { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  }
  const photo = await openGalleryPhoto(id, raw === null ? null : Number(raw), request.signal);
  if (!photo) return new Response(null, { status: 404, headers: GALLERY_PRIVATE_HEADERS });
  return new Response(photo.body, {
    headers: {
      ...GALLERY_PRIVATE_HEADERS,
      "content-type": "image/webp",
      "content-disposition": "inline",
      ...(photo.byteSize === null ? {} : { "content-length": String(photo.byteSize) }),
    },
  });
}
