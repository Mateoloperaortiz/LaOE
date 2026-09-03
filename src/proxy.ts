import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { SESSION_COOKIE } from "@/modules/identity/cookie";

// El proxy solo redirige rutas protegidas sin cookie y emite la CSP con nonce (ADR-011).
// Nunca decide roles ni estados: eso lo hace getActor() en servidor.

const PROTECTED = [/^\/app(\/|$)/, /^\/admin(\/|$)/, /^\/a\//];

let bucketOrigin: string | undefined;

/** Origen del bucket (ADR-033): el navegador sigue el 302 de /api/media y sube directo con fetch. */
function getBucketOrigin(): string {
  bucketOrigin ??= new URL(getEnv().S3_ENDPOINT).origin;
  return bucketOrigin;
}

function buildCsp(nonce: string, dev: boolean): string {
  const bucket = getBucketOrigin();
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${bucket}`,
    "font-src 'self'",
    `connect-src 'self' ${bucket}${dev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (!dev) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const dev = process.env.NODE_ENV !== "production";

  if (PROTECTED.some((pattern) => pattern.test(pathname)) && !request.cookies.get(SESSION_COOKIE)) {
    const login = new URL("/ingresar", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, dev);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (!dev) {
    response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|logos/|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
