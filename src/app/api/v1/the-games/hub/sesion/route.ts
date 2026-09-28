import type { NextRequest } from "next/server";
import { z } from "zod";
import { enterHubAs, getHubState } from "@/modules/competition";
import { t } from "@/shared/copy";
import {
  clearSessionCookie,
  hubJson,
  hubPreflight,
  requestIp,
  setSessionCookie,
  writeAllowed,
} from "../shared";

// Entrar y salir del hub de capitanes (ADR-096). Entrar con el código del equipo abre la sesión y
// devuelve el estado del hub; muchos fallos desde la misma IP responden 429. Salir borra la cookie.

export const dynamic = "force-dynamic";

const METHODS = "POST, DELETE, OPTIONS";
const bodySchema = z.object({ code: z.string().max(40) });

export async function POST(request: NextRequest): Promise<Response> {
  if (!writeAllowed(request))
    return hubJson(request, METHODS, { error: "origen no permitido" }, 403);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return hubJson(request, METHODS, { error: t("T-3036") }, 400);
  try {
    const result = await enterHubAs({ personId: null, ip: requestIp(request) }, body.data.code);
    if (!result.ok) {
      const status = result.reason === "RATE_LIMITED" ? 429 : 400;
      return hubJson(request, METHODS, { error: result.message }, status);
    }
    const state = await getHubState(result.session);
    if (!state) return hubJson(request, METHODS, { error: t("T-3038") }, 401);
    const response = hubJson(request, METHODS, state);
    setSessionCookie(response, result.session);
    return response;
  } catch {
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
