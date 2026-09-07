import { getActor } from "@/modules/identity";
import { issueGoogleSaveUrl, walletAvailability } from "@/modules/wallet";
import { logger } from "@/shared/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function GET() {
  if (!walletAvailability().google) return new Response(null, { status: 404, headers: noStore });
  const actor = await getActor();
  if (!actor)
    return new Response(null, {
      status: 302,
      headers: {
        ...noStore,
        location: "/ingresar?next=%2Fapi%2Fwallet%2Fgoogle",
      },
    });
  try {
    const url = await issueGoogleSaveUrl(actor.personId);
    return new Response(null, { status: 302, headers: { ...noStore, location: url } });
  } catch {
    logger.warn({ platform: "GOOGLE" }, "no se pudo emitir el carnet");
    return new Response(null, {
      status: 302,
      headers: { ...noStore, location: "/app/carnet?error=google" },
    });
  }
}
