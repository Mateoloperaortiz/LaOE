import { headers } from "next/headers";

// Datos del request que el dominio necesita como valores planos (IP y agente), nunca como cabeceras.

export async function clientIp(): Promise<string | null> {
  return ipFromHeaders(await headers());
}

/** La IP del cliente según los encabezados del proxy: la primera de `x-forwarded-for`. */
export function ipFromHeaders(list: Headers): string | null {
  const forwarded = list.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return list.get("x-real-ip");
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
