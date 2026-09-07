import { createPrivateKey, sign } from "node:crypto";
import { getEnv } from "@/env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://walletobjects.googleapis.com/walletobjects/v1/";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const TIMEOUT_MS = 10_000;

export type GoogleWalletTransport = (url: string, init: RequestInit) => Promise<Response>;
export type GoogleWalletMethod = "GET" | "POST" | "PUT" | "PATCH";
export interface GoogleWalletResponse {
  status: number;
  body: unknown;
}

const defaultTransport: GoogleWalletTransport = (url, init) => {
  if (process.env.NODE_ENV === "test") {
    throw new Error("Las pruebas de Google Wallet necesitan un transporte explícito");
  }
  return fetch(url, init);
};
let transport: GoogleWalletTransport = defaultTransport;
let tokenCache: { token: string; expiresAt: number } | undefined;
let pendingToken: Promise<string> | undefined;

export function isGoogleWalletConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_EMAIL && env.GOOGLE_WALLET_SA_KEY_BASE64,
  );
}

function signJwt(claims: Record<string, unknown>): string {
  const env = getEnv();
  if (!isGoogleWalletConfigured() || !env.GOOGLE_WALLET_SA_KEY_BASE64) {
    throw new Error("Google Wallet sin configurar");
  }
  try {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const message = `${header}.${payload}`;
    const key = createPrivateKey(Buffer.from(env.GOOGLE_WALLET_SA_KEY_BASE64, "base64"));
    return `${message}.${sign("RSA-SHA256", Buffer.from(message), key).toString("base64url")}`;
  } catch {
    throw new Error("No se pudo firmar el token de Google Wallet");
  }
}

/** Firma los claims del enlace; wallet decide qué clase y objeto guardar. */
export function signSaveJwt(claims: Record<string, unknown>): string {
  return signJwt(claims);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await transport(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // No reenviar mensajes que puedan incluir Authorization, JWT o datos del cuerpo.
    throw new Error("Google Wallet no respondió dentro del plazo");
  }
}

async function fetchAccessToken(): Promise<string> {
  const env = getEnv();
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: env.GOOGLE_WALLET_SA_EMAIL,
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
  if (!response.ok) throw new Error(`Google Wallet: autorización HTTP ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Google Wallet: autorización inválida");
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("access_token" in body) ||
    typeof body.access_token !== "string" ||
    !body.access_token ||
    !("expires_in" in body) ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0
  )
    throw new Error("Google Wallet: autorización inválida");
  tokenCache = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - 60_000 > Date.now()) return tokenCache.token;
  pendingToken ??= fetchAccessToken();
  try {
    return await pendingToken;
  } finally {
    pendingToken = undefined;
  }
}

/** HTTP y OAuth únicamente; wallet interpreta 404, idempotencia y reintentos de negocio. */
export async function googleWalletRequest(
  method: GoogleWalletMethod,
  path: string,
  body?: unknown,
): Promise<GoogleWalletResponse> {
  const relativePath = path.replace(/^\//, "");
  if (!/^(genericClass|genericObject)(\/[A-Za-z0-9._-]+)?$/.test(relativePath)) {
    throw new Error("Ruta de Google Wallet inválida");
  }
  const token = await getAccessToken();
  const response = await send(`${API_URL}${relativePath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (response.status === 401) tokenCache = undefined;
    return { status: response.status, body: null };
  }
  try {
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  } catch {
    throw new Error("Google Wallet: respuesta inválida");
  }
}

/** Intercepta OAuth y REST: ninguna prueba necesita contactar a Google. */
export function setGoogleWalletTransportForTests(replacement?: GoogleWalletTransport): void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("El transporte de pruebas solo está disponible en test");
  transport = replacement ?? defaultTransport;
  tokenCache = undefined;
  pendingToken = undefined;
}
