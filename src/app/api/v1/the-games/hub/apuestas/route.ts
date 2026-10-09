import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  getHubState,
  HubBetError,
  type HubBetRejection,
  placeHubBetAs,
} from "@/modules/competition";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { logUnavailable } from "../../unavailable";
import { hubJson, hubPreflight, requestIp, sessionOf, writeAllowed } from "../shared";

// La apuesta del capitán desde DÍAS (ADR-096): `pick` es el número del equipo elegido. Usa el mismo
// núcleo que el operador y devuelve el estado nuevo del hub, o el motivo en `error`. El código de
// estado de un rechazo sale de la razón que trae el error del dominio, nunca de su texto (ADR-114
// regla 6).

export const dynamic = "force-dynamic";

const METHODS = "POST, OPTIONS";
/** El código de estado de cada razón del dominio: una razón nueva no compila hasta tener el suyo. */
const REJECTION_STATUS: Record<HubBetRejection, number> = { SESSION: 401 };
/** Un error de dominio sin razón es una regla de la apuesta; una razón que no se reconoce va igual. */
const BET_REJECTED = 400;

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
      const status =
        error instanceof HubBetError
          ? (REJECTION_STATUS[error.reason] ?? BET_REJECTED)
          : BET_REJECTED;
      return hubJson(request, METHODS, { error: error.message }, status);
    }
    if (error instanceof z.ZodError) return hubJson(request, METHODS, { error: t("T-260") }, 400);
    logUnavailable("POST /api/v1/the-games/hub/apuestas", error);
    return hubJson(request, METHODS, { error: "no disponible" }, 503);
  }
}

export function OPTIONS(request: NextRequest): Response {
  return hubPreflight(request, METHODS);
}
