import { toSVG } from "bwip-js/node";
import { getActor } from "@/modules/identity";
import { getInventoryContext, readCatalog } from "@/modules/inventory";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const context = await getInventoryContext(actor.personId);
  if (!context.canManage) return new Response(null, { status: 403 });
  const { code } = await params;
  if (!/^OE-[IU]-[A-Z0-9]{10,40}$/.test(code)) return new Response(null, { status: 404 });
  const known = (await readCatalog()).some((item) =>
    item.mode === "UNIT"
      ? item.units.some((unit) => unit.barcode === code && unit.state !== "LOST")
      : item.barcode === code,
  );
  if (!known) return new Response(null, { status: 404 });
  const svg = toSVG({ bcid: "code128", text: code, scale: 2, height: 12, padding: 4 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
