import type { NextRequest } from "next/server";
import { getHubState } from "@/modules/competition";
import { t } from "@/shared/copy";
import { hubJson, hubPreflight, sessionOf } from "./shared";

// El estado del hub de capitanes para DÍAS (ADR-096): saldo, apuestas abiertas y apuestas del equipo
// de la sesión. Sin sesión responde 401; con una cookie que ya no vale, además dice por qué.

export const dynamic = "force-dynamic";

const METHODS = "GET, OPTIONS";

export async function GET(request: NextRequest): Promise<Response> {
  const { session, hadCookie } = sessionOf(request);
  try {
    const state = await getHubState(session);
    if (!state) {
      return hubJson(request, METHODS, { error: hadCookie ? t("T-3038") : null }, 401);
    }
    return hubJson(request, METHODS, state);
  } catch {
    return hubJson(request, METHODS, { error: "no disponible" }, 503);
  }
}

export function OPTIONS(request: NextRequest): Response {
  return hubPreflight(request, METHODS);
}
