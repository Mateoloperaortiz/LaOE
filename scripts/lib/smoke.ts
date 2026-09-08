import assert from "node:assert/strict";
import { parseArgs } from "node:util";

export interface SmokeOptions {
  base: string;
  expectedSha: string;
  indexing: boolean;
  bucketOrigin: string;
  canonicalBase: string;
}

function origin(value: string | undefined, flag: string): string {
  assert(value, `Falta --${flag}`);
  const url = new URL(value);
  assert(["https:", "http:"].includes(url.protocol), `--${flag} exige HTTP(S)`);
  assert(
    url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    `--${flag} exige HTTPS fuera de loopback`,
  );
  assert(!url.username && !url.password, `--${flag} no admite credenciales`);
  assert(url.pathname === "/" && !url.search && !url.hash, `--${flag} exige un origen sin ruta`);
  return url.origin;
}

export function parseSmokeOptions(args: string[]): SmokeOptions {
  const { values } = parseArgs({
    args,
    options: {
      base: { type: "string" },
      "expected-sha": { type: "string" },
      indexing: { type: "string" },
      "bucket-origin": { type: "string" },
      "canonical-base": { type: "string" },
    },
  });
  const base = origin(values.base, "base");
  assert(
    /^[a-f0-9]{40}$/i.test(values["expected-sha"] ?? ""),
    "--expected-sha exige el SHA completo del candidato",
  );
  assert(["true", "false"].includes(values.indexing ?? ""), "--indexing exige true o false");
  return {
    base,
    expectedSha: values["expected-sha"] as string,
    indexing: values.indexing === "true",
    bucketOrigin: origin(values["bucket-origin"], "bucket-origin"),
    canonicalBase: values["canonical-base"]
      ? origin(values["canonical-base"], "canonical-base")
      : base,
  };
}

export interface SmokeResult {
  check: string;
  ok: boolean;
  error?: string;
}

/** Combina únicamente los grupos User-agent: * (RFC 9309, 2.2.1). */
function publicRobotsRules(body: string): Array<{ directive: string; path: string }> {
  let agents: string[] = [];
  let hasRules = false;
  let hasWildcard = false;
  const rules: Array<{ directive: string; path: string }> = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#", 1)[0]?.trim() ?? "";
    const agent = /^user-agent\s*:\s*(.+)$/i.exec(line)?.[1]?.trim();
    if (agent) {
      if (hasRules) agents = [];
      hasRules = false;
      agents.push(agent);
      if (agent === "*") hasWildcard = true;
      continue;
    }
    const rule = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!rule) continue;
    hasRules = true;
    if (agents.includes("*")) {
      const [, directive = "", path = ""] = rule;
      rules.push({ directive: directive.toLowerCase(), path: path.trim() });
    }
  }
  assert(hasWildcard, "Falta el grupo User-agent: * en robots.txt");
  return rules;
}

/** HTTP de solo lectura; nunca abre sesiones, importa datos ni consume una respuesta de usuario. */
export async function runSmoke(options: SmokeOptions): Promise<SmokeResult[]> {
  const read = async (path: string, contentType: RegExp) => {
    const response = await fetch(new URL(path, options.base), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "cache-control": "no-cache" },
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    assert.match(
      response.headers.get("content-type") ?? "",
      contentType,
      `${path}: tipo de contenido`,
    );
    return { response, body: await response.text() };
  };
  const checks: Array<[string, () => Promise<void>]> = [
    [
      "salud y SHA",
      async () => {
        const { response, body } = await read("/api/health", /application\/json/i);
        const health = JSON.parse(body);
        assert.equal(health.status, "ok", "Postgres no está disponible");
        assert.equal(health.commit, options.expectedSha, "El SHA desplegado difiere del candidato");
        assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
      },
    ],
    [
      "HTTPS, CSP e indexación",
      async () => {
        const { response } = await read("/", /text\/html/i);
        const hsts = response.headers.get("strict-transport-security") ?? "";
        assert(Number(/max-age=(\d+)/i.exec(hsts)?.[1]) >= 31_536_000, "HSTS insuficiente");
        assert.match(hsts, /includeSubDomains/i);
        const csp = response.headers.get("content-security-policy") ?? "";
        const directives = new Map(
          csp.split(";").map((value) => {
            const [name = "", ...tokens] = value.trim().split(/\s+/);
            return [name, tokens];
          }),
        );
        for (const name of ["connect-src", "img-src"]) {
          assert(
            directives.get(name)?.includes(options.bucketOrigin),
            `${name} no incluye el bucket`,
          );
        }
        assert(
          directives.get("script-src")?.some((token) => token.startsWith("'nonce-")),
          "Falta nonce CSP",
        );
        assert(directives.get("frame-ancestors")?.includes("'none'"), "Falta frame-ancestors");
        if (new URL(options.base).protocol === "https:") {
          assert(directives.has("upgrade-insecure-requests"), "Falta la actualización CSP a HTTPS");
        }
        const noindex = /\bnoindex\b/i.test(response.headers.get("x-robots-tag") ?? "");
        assert.equal(
          noindex,
          !options.indexing,
          "X-Robots-Tag no coincide con la indexación esperada",
        );
      },
    ],
    [
      "robots.txt",
      async () => {
        const { body } = await read("/robots.txt", /text\/plain/i);
        const rules = publicRobotsRules(body);
        const rootAllowed = rules.some((rule) => rule.directive === "allow" && rule.path === "/");
        const rootDisallowed =
          !rootAllowed && rules.some((rule) => rule.directive === "disallow" && rule.path === "/");
        assert.equal(
          rootDisallowed,
          !options.indexing,
          "robots.txt no coincide con la indexación esperada",
        );
        if (options.indexing) {
          assert(rootAllowed, "Falta Allow: / para User-agent: *");
          assert(
            body
              .split(/\r?\n/)
              .some((line) => line.trim() === `Sitemap: ${options.canonicalBase}/sitemap.xml`),
            "Sitemap canónico incorrecto en robots",
          );
        }
      },
    ],
    [
      "sitemap.xml",
      async () => {
        const { body } = await read("/sitemap.xml", /(?:application|text)\/xml/i);
        assert.match(body, /<urlset\b/);
        assert.match(body, /<\/urlset>/);
        const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
          (match) => match[1] as string,
        );
        assert(
          locations.includes(`${options.canonicalBase}/`),
          "Falta portada canónica en sitemap",
        );
        assert(
          locations.every((location) => new URL(location).origin === options.canonicalBase),
          "El sitemap mezcla orígenes",
        );
      },
    ],
    [
      "manifest PWA",
      async () => {
        const { body } = await read("/manifest.webmanifest", /application\/(?:manifest\+)?json/i);
        const manifest = JSON.parse(body);
        assert.equal(manifest.start_url, "/app");
        assert.equal(manifest.display, "standalone");
        assert(Array.isArray(manifest.icons), "Faltan iconos PWA");
        for (const size of ["192x192", "512x512"]) {
          assert(
            manifest.icons.some((icon: { sizes?: string }) => icon.sizes === size),
            `Falta icono ${size}`,
          );
        }
      },
    ],
    [
      "calendario público",
      async () => {
        const { body } = await read("/api/ics/publico.ics", /text\/calendar/i);
        assert.match(body, /^BEGIN:VCALENDAR\r?\n/);
        assert.match(body, /^VERSION:2\.0\r?$/m);
        assert.match(body, /\r?\nEND:VCALENDAR\s*$/);
      },
    ],
  ];
  const results: SmokeResult[] = [];
  for (const [check, execute] of checks) {
    try {
      await execute();
      results.push({ check, ok: true });
    } catch (error) {
      results.push({
        check,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
