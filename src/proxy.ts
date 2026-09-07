import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/env";
import { SESSION_COOKIE } from "@/modules/identity/cookie";
import { bucketOrigin } from "@/shared/lib/storage-origin";

// El proxy solo redirige rutas protegidas sin cookie y emite la CSP con nonce (ADR-011).
// Nunca decide roles ni estados: eso lo hace getActor() en servidor.

const PROTECTED = [/^\/app(\/|$)/, /^\/admin(\/|$)/, /^\/a\//];
const HOST_MODE = /^\/admin\/ocasiones\/[a-z0-9-]+\/anfitrion$/;

/** Origen del bucket (ADR-033): el navegador sigue el 302 de /api/media y sube directo con fetch. */
function getBucketOrigin(): string {
  const env = getEnv();
  return bucketOrigin({
    endpoint: env.S3_ENDPOINT,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
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
    // El service worker de la PWA (ADR-038 regla 4) vive en /sw.js.
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  // El build también se ensaya en loopback HTTP con Garage. Los entornos publicados tienen
  // APP_URL HTTPS; allí se fuerza HTTPS para todos los recursos sin alterar el origen del bucket.
  if (!dev && new URL(getEnv().APP_URL).protocol === "https:") {
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
  // La cámara solo en el modo anfitrión (ADR-035 regla 8): lee el QR del carnet.
  const camera = HOST_MODE.test(pathname) ? "camera=(self)" : "camera=()";
  response.headers.set(
    "permissions-policy",
    `${camera}, microphone=(), geolocation=(), payment=()`,
  );
  if (!dev) {
    response.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  // Staging y local no se indexan (ADR-023, ADR-033); las páginas además llevan la meta robots.
  if (!getEnv().PUBLIC_INDEXING) {
    response.headers.set("x-robots-tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|logos/|icons/|wallet/|icon.svg|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
