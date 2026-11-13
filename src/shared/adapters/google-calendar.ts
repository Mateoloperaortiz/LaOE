import { createPrivateKey, sign } from "node:crypto";
import { getEnv } from "@/env";
import type { GoogleCalendarEvent, GoogleCalendarEventBody } from "./google-calendar-types";

export type { GoogleCalendarEvent, GoogleCalendarEventBody } from "./google-calendar-types";

// Google Calendar de la junta (ADR-197 regla 6): la casa escribe y lee eventos con la cuenta de servicio
// que ya usa Google Wallet, sobre un calendario compartido con ella. Sin el identificador del calendario
// o sin la cuenta de servicio, la sincronización queda apagada y el calendario vive solo en la casa.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/calendar/v3/calendars/";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TIMEOUT_MS = 10_000;

export type GoogleCalendarTransport = (url: string, init: RequestInit) => Promise<Response>;

export class GoogleCalendarError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "SIGNING_FAILED" | "UNREACHABLE" | "REJECTED",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

const defaultTransport: GoogleCalendarTransport = (url, init) => {
  if (process.env.NODE_ENV === "test") {
    throw new Error("Las pruebas de Google Calendar necesitan un transporte explícito");
  }
  return fetch(url, init);
};
let transport: GoogleCalendarTransport = defaultTransport;
let tokenCache: { token: string; expiresAt: number } | undefined;

export function isGoogleCalendarConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.GOOGLE_CALENDAR_JUNTA_ID && env.GOOGLE_WALLET_SA_EMAIL && env.GOOGLE_WALLET_SA_KEY_BASE64,
  );
}

/** Para las pruebas: un transporte falso y un caché de token limpio. */
export function setGoogleCalendarTransport(next: GoogleCalendarTransport | null): void {
  transport = next ?? defaultTransport;
  tokenCache = undefined;
}

function signJwt(claims: Record<string, unknown>): string {
  const key = getEnv().GOOGLE_WALLET_SA_KEY_BASE64;
  if (!key) throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar sin configurar");
  try {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const message = `${header}.${payload}`;
    const privateKey = createPrivateKey(Buffer.from(key, "base64"));
    return `${message}.${sign("RSA-SHA256", Buffer.from(message), privateKey).toString("base64url")}`;
  } catch {
    throw new GoogleCalendarError(
      "SIGNING_FAILED",
      "No se pudo firmar el token de Google Calendar",
    );
  }
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await transport(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // No reenviar mensajes que puedan llevar el token o el cuerpo.
    throw new GoogleCalendarError("UNREACHABLE", "Google Calendar no respondió dentro del plazo");
  }
}

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: getEnv().GOOGLE_WALLET_SA_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const response = await send(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new GoogleCalendarError("REJECTED", "Google no entregó el token", response.status);
  }
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

function calendarUrl(path: string, query?: URLSearchParams): string {
  const id = getEnv().GOOGLE_CALENDAR_JUNTA_ID;
  if (!id || !isGoogleCalendarConfigured()) {
    throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar sin configurar");
  }
  return `${API_URL}${encodeURIComponent(id)}/events${path}${query ? `?${query}` : ""}`;
}

async function call(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await send(url, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body: parsed };
}

function expectOk(result: { status: number; body: unknown }): GoogleCalendarEvent {
  if (result.status < 200 || result.status >= 300) {
    throw new GoogleCalendarError("REJECTED", "Google Calendar rechazó el pedido", result.status);
  }
  return result.body as GoogleCalendarEvent;
}

export async function insertCalendarEvent(
  event: GoogleCalendarEventBody,
): Promise<GoogleCalendarEvent> {
  return expectOk(await call("POST", calendarUrl(""), event));
}

export async function patchCalendarEvent(
  id: string,
  event: GoogleCalendarEventBody,
): Promise<GoogleCalendarEvent> {
  return expectOk(await call("PATCH", calendarUrl(`/${encodeURIComponent(id)}`), event));
}

/** Borrar lo que ya no existe allá no es un error. */
export async function deleteCalendarEvent(id: string): Promise<void> {
  const result = await call("DELETE", calendarUrl(`/${encodeURIComponent(id)}`));
  if (result.status === 404 || result.status === 410) return;
  if (result.status < 200 || result.status >= 300) {
    throw new GoogleCalendarError("REJECTED", "Google Calendar rechazó el pedido", result.status);
  }
}

/**
 * Los eventos que cambiaron desde `updatedMin` dentro de la ventana, con los borrados, página por
 * página. Los recurrentes llegan expandidos en sus instancias.
 */
export async function listCalendarEvents(params: {
  timeMin: Date;
  timeMax: Date;
  updatedMin?: Date | undefined;
}): Promise<GoogleCalendarEvent[]> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "250",
      timeMin: params.timeMin.toISOString(),
      timeMax: params.timeMax.toISOString(),
      ...(params.updatedMin ? { updatedMin: params.updatedMin.toISOString() } : {}),
      ...(pageToken ? { pageToken } : {}),
    });
    const result = await call("GET", calendarUrl("", query));
    if (result.status !== 200) {
      throw new GoogleCalendarError(
        "REJECTED",
        "Google Calendar rechazó la lectura",
        result.status,
      );
    }
    const body = result.body as { items?: GoogleCalendarEvent[]; nextPageToken?: string };
    events.push(...(body.items ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}
