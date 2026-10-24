import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));

import { clientIp, ipFromHeaders, userAgent } from "@/shared/lib/request";

describe("IP del ingreso público", () => {
  beforeEach(() => {
    state.headers = new Headers();
  });

  it("toma la IP del edge aunque el cliente anteponga otras cabeceras", async () => {
    state.headers = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.9, 192.0.2.3, 203.0.113.7",
      "cf-connecting-ip": "198.51.100.10",
      forwarded: "for=198.51.100.11",
      "user-agent": "navegador-sintetico",
    });

    expect(await clientIp()).toBe("203.0.113.7");
    expect(await userAgent()).toBe("navegador-sintetico");
  });

  it.each([
    "203.0.113.7",
    "2001:db8::7",
    "::ffff:192.0.2.7",
    "127.0.0.1",
    "::1",
  ])("acepta una dirección válida: %s", (ip) => {
    expect(ipFromHeaders(new Headers({ "x-real-ip": ` ${ip} ` }))).toBe(ip);
  });

  it.each([
    "",
    "desconocida",
    "203.0.113.7:443",
    "[2001:db8::7]:443",
    "203.0.113.7, 198.51.100.9",
    "fe80::1%eth0",
    "999.0.0.1",
  ])("no recupera la IP de una cabecera alternativa si la del edge es inválida: %s", (ip) => {
    expect(
      ipFromHeaders(
        new Headers({
          "x-real-ip": ip,
          "x-forwarded-for": "198.51.100.9",
          "cf-connecting-ip": "198.51.100.10",
        }),
      ),
    ).toBeNull();
  });

  it("no confía en cabeceras alternativas cuando falta la del ingreso", async () => {
    state.headers = new Headers({
      "x-forwarded-for": "198.51.100.9",
      "cf-connecting-ip": "198.51.100.10",
      forwarded: "for=198.51.100.11",
    });
    expect(await clientIp()).toBeNull();
    expect(ipFromHeaders(new Headers())).toBeNull();
  });
});
