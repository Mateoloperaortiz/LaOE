import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { parseSmokeOptions, runSmoke, type SmokeOptions } from "../../scripts/lib/smoke";

const sha = "a".repeat(40);
const canonical = "https://app.example.test";
let base: string;
let wrongSha = false;
let robots = `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${canonical}/sitemap.xml\n`;
const defaultRobots = robots;
const server = createServer((request, response) => {
  const bodies: Record<string, [string, string]> = {
    "/": ["text/html", "<!doctype html><title>Prueba</title>"],
    "/robots.txt": ["text/plain", robots],
    "/sitemap.xml": ["application/xml", `<urlset><url><loc>${canonical}/</loc></url></urlset>`],
    "/manifest.webmanifest": [
      "application/manifest+json",
      JSON.stringify({
        start_url: "/app",
        display: "standalone",
        icons: [{ sizes: "192x192" }, { sizes: "512x512" }],
      }),
    ],
    "/api/ics/publico.ics": [
      "text/calendar",
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n",
    ],
    "/api/health": [
      "application/json",
      JSON.stringify({ status: "ok", commit: wrongSha ? "b".repeat(40) : sha }),
    ],
  };
  const row = bodies[request.url ?? ""];
  if (!row) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": row[0],
    "cache-control": "no-store",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy":
      "script-src 'nonce-prueba'; frame-ancestors 'none'; connect-src 'self' https://media.storage.test; img-src 'self' https://media.storage.test",
  });
  response.end(row[1]);
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
afterEach(() => {
  robots = defaultRobots;
});

function options(): SmokeOptions {
  return {
    base,
    expectedSha: sha,
    indexing: true,
    canonicalBase: canonical,
    bucketOrigin: "https://media.storage.test",
  };
}

describe("smoke HTTP de release", () => {
  it("acepta dominio temporal con referencias al dominio canónico", async () => {
    expect((await runSmoke(options())).every((result) => result.ok)).toBe(true);
  });
  it("acepta los grupos de rastreadores añadidos por Cloudflare", async () => {
    robots = `User-agent: *\nContent-Signal: search=yes,ai-train=no\nAllow: /\n\nUser-agent: ExampleBot\nDisallow: /\n\n${defaultRobots}`;
    expect((await runSmoke(options())).every((result) => result.ok)).toBe(true);
  });
  it("no confunde el permiso de un bot con el del público", async () => {
    robots = `User-agent: *\nDisallow: /\nUser-agent: ExampleBot\nAllow: /\nSitemap: ${canonical}/sitemap.xml\n`;
    const results = await runSmoke(options());
    expect(results.find((result) => result.check === "robots.txt")?.ok).toBe(false);
  });
  it("combina grupos públicos, admite comentarios y conserva agentes compartidos", async () => {
    robots = `User-agent: * # público\nUser-agent: ExampleBot\nDisallow: /\n\nUser-agent: *\nAllow: / # misma especificidad: prevalece Allow\nSitemap: ${canonical}/sitemap.xml\n`;
    expect((await runSmoke(options())).every((result) => result.ok)).toBe(true);
  });
  it("exige un grupo público aunque un bot pueda recorrer el sitio", async () => {
    robots = `User-agent: ExampleBot\nAllow: /\nSitemap: ${canonical}/sitemap.xml\n`;
    const results = await runSmoke(options());
    expect(results.find((result) => result.check === "robots.txt")?.ok).toBe(false);
  });
  it("detecta otro SHA aunque la salud sea 200", async () => {
    wrongSha = true;
    try {
      const results = await runSmoke(options());
      expect(results.find((result) => result.check === "salud y SHA")?.ok).toBe(false);
      expect(results.filter((result) => result.ok)).toHaveLength(5);
    } finally {
      wrongSha = false;
    }
  });
  it("no acepta CSP de otro bucket ni indexación contraria", async () => {
    const results = await runSmoke({
      ...options(),
      indexing: false,
      bucketOrigin: "https://storage.test",
    });
    expect(results.find((result) => result.check === "HTTPS, CSP e indexación")?.ok).toBe(false);
    expect(results.find((result) => result.check === "robots.txt")?.ok).toBe(false);
  });
  it("exige expectativas explícitas y rechaza credenciales en la URL", () => {
    expect(() => parseSmokeOptions(["--base", "http://example.test"])).toThrow(/HTTPS/);
    expect(() => parseSmokeOptions(["--base", canonical])).toThrow(/expected-sha/);
    expect(() => parseSmokeOptions(["--base", "https://user:secret@example.test"])).toThrow(
      /credenciales/,
    );
    expect(
      parseSmokeOptions([
        "--base",
        canonical,
        "--expected-sha",
        sha,
        "--indexing",
        "false",
        "--bucket-origin",
        "https://media.storage.test",
      ]),
    ).toMatchObject({ canonicalBase: canonical, indexing: false });
  });
});
