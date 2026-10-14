import type { NextRequest } from "next/server";
import { z } from "zod";
import { enterHubAs, getHubState } from "@/modules/competition";
import { t } from "@/shared/copy";
import { logUnavailable } from "../../unavailable";
import {
  clearSessionCookie,
  hubJson,
  hubPreflight,
  requestIp,
  setSessionCookie,
  writeAllowed,
} from "../shared";

// Entrar y salir del hub de capitanes (ADR-096). Entrar con el código del equipo abre la sesión y
// devuelve el estado del hub; muchos fallos desde la misma IP responden 429. La primera vez, el equipo
// acepta las instrucciones: sin `accept` responde 409 con la versión vigente (ADR-099). Salir borra la
// cookie.

export const dynamic = "force-dynamic";

const METHODS = "POST, DELETE, OPTIONS";
const bodySchema = z.object({
  code: z.string().max(40),
  accept: z.number().int().min(1).max(999).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  if (!writeAllowed(request))
    return hubJson(request, METHODS, { error: "origen no permitido" }, 403);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return hubJson(request, METHODS, { error: t("T-3036") }, 400);
  try {
    const result = await enterHubAs(
      { personId: null, ip: requestIp(request) },
      body.data.code,
      body.data.accept ?? null,
    );
    if (!result.ok) {
      if (result.reason === "TERMS") {
        return hubJson(request, METHODS, { error: result.message, terms: result.version }, 409);
      }
      const status = result.reason === "RATE_LIMITED" ? 429 : 400;
      return hubJson(request, METHODS, { error: result.message }, status);
    }
    const state = await getHubState(result.session);
    if (!state) return hubJson(request, METHODS, { error: t("T-3038") }, 401);
    const response = hubJson(request, METHODS, state);
    setSessionCookie(response, result.session);
    return response;
  } catch (error) {
    logUnavailable("POST /api/v1/the-games/hub/sesion", error);
    return hubJson(request, METHODS, { error: "no disponible" }, 503);
  }
}

export function DELETE(request: NextRequest): Response {
  if (!writeAllowed(request))
    return hubJson(request, METHODS, { error: "origen no permitido" }, 403);
  const response = hubJson(request, METHODS, { ok: true });
  clearSessionCookie(response);
  return response;
}

export function OPTIONS(request: NextRequest): Response {
  return hubPreflight(request, METHODS);
}
