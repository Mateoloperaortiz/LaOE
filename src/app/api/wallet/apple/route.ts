import { getActor } from "@/modules/identity";
import { buildApplePass, walletAvailability } from "@/modules/wallet";
import { logger } from "@/shared/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  if (!walletAvailability().apple) return new Response(null, { status: 404, headers: noStore });
  const actor = await getActor();
  if (!actor)
    return new Response(null, {
      status: 302,
      headers: {
        ...noStore,
        location: new URL("/ingresar?next=%2Fapi%2Fwallet%2Fapple", request.url).href,
      },
    });
  try {
    const pass = await buildApplePass(actor.personId);
    return new Response(new Uint8Array(pass), {
      headers: {
        ...noStore,
        "content-type": "application/vnd.apple.pkpass",
        "content-disposition": 'attachment; filename="carnet-oe.pkpass"',
      },
    });
  } catch {
    logger.warn({ platform: "APPLE" }, "no se pudo emitir el carnet");
    return new Response(null, {
      status: 302,
      headers: { ...noStore, location: new URL("/app/carnet?error=apple", request.url).href },
    });
  }
}
