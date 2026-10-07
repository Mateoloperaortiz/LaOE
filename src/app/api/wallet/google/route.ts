import { redirectFromDownload } from "@/app/_lib/download";
import { getActor } from "@/modules/identity";
import { issueGoogleSaveUrl, walletAvailability } from "@/modules/wallet";
import { logger } from "@/shared/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function GET() {
  if (!walletAvailability().google) return new Response(null, { status: 404, headers: noStore });
  const actor = await getActor();
  // El pase se pide desde el carnet (ADR-113, regla 10).
  if (!actor) return redirectFromDownload("SIGN_IN", "/app/carnet");
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
