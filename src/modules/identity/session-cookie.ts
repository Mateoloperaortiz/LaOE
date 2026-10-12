import "server-only";
import { getEnv } from "@/env";
import { SESSION_COOKIE } from "./cookie";

// Único sitio que escribe y borra la cookie de sesión (ADR-127 regla 6). Este archivo no es
// `"use server"` a propósito: ahí toda función exportada queda como server action, y escribir la
// cookie no es algo que el navegador pueda pedir. El nombre vive en `cookie.ts`, sin dependencias
// de Node, porque también lo lee el proxy.

/**
 * La tienda de cookies del request. `next/headers` se importa acá adentro y no arriba: el `index.ts`
 * del módulo reexporta este archivo y también lo carga Node a secas (el poller, los scripts y el
 * lanzador de la E2E), donde ese import no resuelve. Next se carga recién al atender un request,
 * igual que en `current.ts`.
 */
async function cookieStore() {
  const { cookies } = await import("next/headers");
  return cookies();
}

interface SessionCookieInput {
  /** El token en claro que devolvió el dominio al abrir la sesión; en la base solo queda su hash. */
  token: string;
  /** El vencimiento de la sesión en la base. */
  expiresAt: Date;
  /**
   * Con `true` la cookie lleva el vencimiento de la sesión; con `false` va sin él y dura lo que el
   * navegador abierto. No tiene valor por defecto: cada camino dice cuál es el suyo.
   */
  remember: boolean;
}

/**
 * Escribe la cookie de la sesión recién abierta. Va sin `domain`: es solo del host que la escribe
 * (ADR-085 regla 6). `secure` sale del esquema de `APP_URL`, porque en local la casa se sirve por
 * http y un navegador descarta ahí una cookie `Secure`.
 */
export async function writeSessionCookie(input: SessionCookieInput): Promise<void> {
  const store = await cookieStore();
  store.set({
    name: SESSION_COOKIE,
    value: input.token,
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    ...(input.remember ? { expires: input.expiresAt } : {}),
  });
}

/** Borra la cookie al cerrar sesión. No sale del módulo: su único llamador es la salida de `actions.ts`. */
export async function deleteSessionCookie(): Promise<void> {
  const store = await cookieStore();
  store.delete(SESSION_COOKIE);
}
