import type { NextRequest } from "next/server";
import { z } from "zod";
import { getHubState, placeHubBetAs } from "@/modules/competition";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { hubJson, hubPreflight, requestIp, sessionOf, writeAllowed } from "../shared";

// La apuesta del capitán desde DÍAS (ADR-096): `pick` es el número del equipo elegido. Usa el mismo
// núcleo que el operador y devuelve el estado nuevo del hub, o el motivo en `error`.

export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
const bodySchema = z.object({
  marketId: z.string().min(1).max(40),
  pick: z.number().int(),
  stake: z.number().int(),
});

export async function POST(request: NextRequest): Promise<Response> {
  if (!writeAllowed(request))
    return hubJson(request, METHODS, { error: "origen no permitido" }, 403);
  const { session } = sessionOf(request);
  if (!session) return hubJson(request, METHODS, { error: t("T-3038") }, 401);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return hubJson(request, METHODS, { error: t("T-260") }, 400);
  try {
    await placeHubBetAs({ personId: null, ip: requestIp(request) }, session, body.data);
    const state = await getHubState(session);
    if (!state) return hubJson(request, METHODS, { error: t("T-3038") }, 401);
    return hubJson(request, METHODS, state);
  } catch (error) {
    if (error instanceof DomainError) {
      const status = error.message === t("T-3038") ? 401 : 400;
      return hubJson(request, METHODS, { error: error.message }, status);
    }
    if (error instanceof z.ZodError) return hubJson(request, METHODS, { error: t("T-260") }, 400);
    return hubJson(request, METHODS, { error: "no disponible" }, 503);
  }
}

export function OPTIONS(request: NextRequest): Response {
  return hubPreflight(request, METHODS);
}
