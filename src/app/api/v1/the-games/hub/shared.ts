import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import {
  HUB_API_PATH,
  HUB_COOKIE,
  type HubSession,
  hubCookieValue,
  hubSessionFromCookie,
} from "@/modules/competition";
import { credentialedCorsHeaders } from "@/shared/lib/cors";
import { ipFromHeaders } from "@/shared/lib/request";

// Piezas comunes de la API del hub de capitanes (ADR-096): CORS con credenciales solo para DÍAS,
// respuestas sin caché y la cookie firmada de la sesión del equipo, que DÍAS nunca lee.

export function hubJson(
  request: NextRequest,
  methods: string,
  body: unknown,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...credentialedCorsHeaders(
        getEnv().PUBLIC_API_ORIGINS,
        request.headers.get("origin"),
        methods,
      ),
      "cache-control": "no-store",
    },
  });
}

export function hubPreflight(request: NextRequest, methods: string): Response {
  return new Response(null, {
    status: 204,
    headers: credentialedCorsHeaders(
      getEnv().PUBLIC_API_ORIGINS,
      request.headers.get("origin"),
      methods,
    ),
  });
}

/** Las escrituras solo llegan desde DÍAS, en JSON: así la verificación previa de CORS es obligatoria
 *  y un formulario de otro sitio no puede apostar (ADR-096 regla 3). */
export function writeAllowed(request: NextRequest): boolean {
  const origin = request.headers.get("origin")?.toLowerCase();
  const json = (request.headers.get("content-type") ?? "").toLowerCase();
  return Boolean(
    origin &&
      getEnv().PUBLIC_API_ORIGINS.includes(origin) &&
      (request.method === "DELETE" || json.startsWith("application/json")),
  );
}

export function sessionOf(request: NextRequest): {
  session: HubSession | null;
  hadCookie: boolean;
} {
  const value = request.cookies.get(HUB_COOKIE)?.value;
  return { session: hubSessionFromCookie(value), hadCookie: Boolean(value) };
}

export function requestIp(request: NextRequest): string | null {
  return ipFromHeaders(request.headers);
}

function cookieBase() {
  return {
    name: HUB_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().APP_URL.startsWith("https://"),
    path: HUB_API_PATH,
  };
}

export function setSessionCookie(response: NextResponse, session: HubSession): void {
  response.cookies.set({
    ...cookieBase(),
    value: hubCookieValue(session),
    expires: new Date(session.expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({ ...cookieBase(), value: "", maxAge: 0 });
}
