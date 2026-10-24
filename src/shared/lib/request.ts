import { isIP } from "node:net";
import { headers } from "next/headers";

// Datos del request que el dominio necesita como valores planos (IP y agente), nunca como cabeceras.

export async function clientIp(): Promise<string | null> {
  return ipFromHeaders(await headers());
}

/** IP que establece el ingreso HTTP público de Railway (ADR-142); sin respaldos del cliente. */
export function ipFromHeaders(list: Headers): string | null {
  const ip = list.get("x-real-ip")?.trim();
  return ip && !ip.includes("%") && isIP(ip) !== 0 ? ip : null;
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
