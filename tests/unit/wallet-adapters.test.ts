import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { isApplePassConfigured, signPass } from "@/shared/adapters/apple-pass";
import {
  googleWalletRequest,
  isGoogleWalletConfigured,
  setGoogleWalletTransportForTests,
  signSaveJwt,
} from "@/shared/adapters/google-wallet";
import credentials from "../fixtures/wallet/toy-credentials.json";

const { env } = vi.hoisted(() => ({ env: {} as Partial<Env> }));
vi.mock("@/env", () => ({ getEnv: () => env }));

function decode(token: string): { header: unknown; claims: Record<string, unknown> } {
  const [header, payload, signature] = token.split(".") as [string, string, string];
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      createPublicKey(Buffer.from(credentials.googlePublicKey, "base64")),
      Buffer.from(signature, "base64url"),
    ),
  ).toBe(true);
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    claims: JSON.parse(Buffer.from(payload, "base64url").toString()),
  };
}

/** Lee el directorio ZIP para comprobar los bytes de cada entrada, no solo sus nombres. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let cursor = buffer.readUInt32LE(end + 16);
  const count = buffer.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const local = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const compressed = buffer.subarray(start, start + size);
    entries.set(name, method === 0 ? compressed : inflateRawSync(compressed));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key as keyof Env];
  Object.assign(env, {
    APPLE_PASS_TYPE_ID: "pass.test.oe",
    APPLE_TEAM_ID: "TESTTEAM00",
    APPLE_PASS_CERT_BASE64: credentials.signerCert,
    APPLE_PASS_KEY_BASE64: credentials.signerKey,
    GOOGLE_WALLET_ISSUER_ID: "1234567890",
    GOOGLE_WALLET_SA_EMAIL: "wallet@test-project.iam.gserviceaccount.com",
    GOOGLE_WALLET_SA_KEY_BASE64: credentials.googleKey,
  });
  setGoogleWalletTransportForTests();
});

afterEach(() => {
  setGoogleWalletTransportForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("adaptador Apple Wallet", () => {
  it("firma un pase completo, conserva campos y produce manifest y CMS verificables", async () => {
    const icon = await readFile(join(process.cwd(), "public/icons/icon-192.png"));
    const props = {
      formatVersion: 1,
      passTypeIdentifier: "pass.test.oe",
      teamIdentifier: "TESTTEAM00",
      serialNumber: "persona-ficticia",
      organizationName: "OE de prueba",
      description: "Carnet de prueba",
      logoText: "OE de prueba",
      backgroundColor: "rgb(0,31,62)",
      foregroundColor: "rgb(246,246,246)",
      labelColor: "rgb(255,216,75)",
      sharingProhibited: true,
      generic: { primaryFields: [{ key: "nombre", label: "Miembro", value: "Persona de prueba" }] },
      barcodes: [
        { format: "PKBarcodeFormatQR", message: "oe2.test", messageEncoding: "iso-8859-1" },
      ],
    };
    const buffer = await signPass(
      { files: { "icon.png": icon, "logo.png": icon }, props },
      {
        wwdr: Buffer.from(credentials.wwdr, "base64"),
        signerCert: Buffer.from(credentials.signerCert, "base64"),
        signerKey: Buffer.from(credentials.signerKey, "base64"),
      },
    );
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const files = unzip(buffer);
    expect(JSON.parse(files.get("pass.json")?.toString() ?? "{}")).toMatchObject(props);
    const manifest = files.get("manifest.json") as Buffer;
    const hashes = JSON.parse(manifest.toString()) as Record<string, string>;
    for (const [name, bytes] of files) {
      if (name === "signature" || name === "manifest.json") continue;
      expect(hashes[name]).toBe(createHash("sha1").update(bytes).digest("hex"));
    }
    const directory = await mkdtemp(join(tmpdir(), "wallet-signature-test-"));
    try {
      await Promise.all([
        writeFile(join(directory, "manifest.json"), manifest),
        writeFile(join(directory, "signature"), files.get("signature") as Buffer),
        writeFile(join(directory, "ca.crt"), Buffer.from(credentials.wwdr, "base64")),
      ]);
      const verified = execFileSync(
        "openssl",
        [
          "cms",
          "-verify",
          "-inform",
          "DER",
          "-binary",
          "-in",
          join(directory, "signature"),
          "-content",
          join(directory, "manifest.json"),
          "-CAfile",
          join(directory, "ca.crt"),
          "-purpose",
          "any",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      expect(verified).toEqual(manifest);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("sin configuración no intenta firmar", async () => {
    delete env.APPLE_PASS_KEY_BASE64;
    expect(isApplePassConfigured()).toBe(false);
    await expect(signPass({ files: {}, props: {} })).rejects.toThrow("sin configurar");
  });
});

describe("adaptador Google Wallet", () => {
  it("firma enlaces RS256 y preserva los claims recibidos", () => {
    const claims = {
      iss: env.GOOGLE_WALLET_SA_EMAIL,
      aud: "google",
      typ: "savetowallet",
      iat: 1700000000,
      origins: ["https://example.test"],
      payload: { genericObjects: [{ id: "1234567890.persona", classId: "1234567890.test" }] },
    };
    expect(decode(signSaveJwt(claims))).toEqual({ header: { alg: "RS256", typ: "JWT" }, claims });
  });

  it("reutiliza OAuth entre peticiones concurrentes y renueva un minuto antes del vencimiento", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-07T00:00:00Z"));
    const requests: { url: string; init: RequestInit }[] = [];
    const fake = vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      if (url === "https://oauth2.googleapis.com/token") {
        const params = new URLSearchParams(String(init.body));
        expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
        const { claims } = decode(params.get("assertion") as string);
        expect(claims).toMatchObject({
          iss: env.GOOGLE_WALLET_SA_EMAIL,
          aud: url,
          scope: "https://www.googleapis.com/auth/wallet_object.issuer",
        });
        expect(Number(claims.exp) - Number(claims.iat)).toBe(3600);
        return Response.json({ access_token: "oauth-test", expires_in: 3600 });
      }
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer oauth-test");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.redirect).toBe("error");
      return Response.json({ id: "1234567890.persona" });
    });
    setGoogleWalletTransportForTests(fake);
    await Promise.all([
      googleWalletRequest("GET", "/genericClass/1234567890.test"),
      googleWalletRequest("PUT", "genericObject/1234567890.persona", { state: "ACTIVE" }),
    ]);
    const oauthRequests = () =>
      requests.filter((request) => request.url === "https://oauth2.googleapis.com/token");
    expect(oauthRequests()).toHaveLength(1);
    expect(requests.find((request) => request.init.method === "PUT")?.init.body).toBe(
      '{"state":"ACTIVE"}',
    );
    vi.setSystemTime(new Date("2026-09-07T00:59:01Z"));
    await googleWalletRequest("GET", "genericObject/1234567890.persona");
    expect(oauthRequests()).toHaveLength(2);
  });

  it("devuelve estado HTTP sin filtrar cuerpos sensibles y limpia token ante 401", async () => {
    let oauthCount = 0;
    const fake = vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        oauthCount++;
        return Response.json({ access_token: "oauth-test", expires_in: 3600 });
      }
      return Response.json({ error: "datos-personales" }, { status: 401 });
    });
    setGoogleWalletTransportForTests(fake);
    expect(await googleWalletRequest("GET", "genericObject/1234567890.persona")).toEqual({
      status: 401,
      body: null,
    });
    await googleWalletRequest("GET", "genericObject/1234567890.persona");
    expect(oauthCount).toBe(2);
  });

  it("sanitiza errores de OAuth y transporte y permite reintentar", async () => {
    setGoogleWalletTransportForTests(async () =>
      Response.json({ error: "secreto" }, { status: 400 }),
    );
    await expect(googleWalletRequest("GET", "genericClass/test")).rejects.toThrow(
      "autorización HTTP 400",
    );
    setGoogleWalletTransportForTests(async () => {
      throw new Error("secreto-del-transporte");
    });
    await expect(googleWalletRequest("GET", "genericClass/test")).rejects.toThrow(
      "Google Wallet no respondió dentro del plazo",
    );
  });

  it("limita también OAuth a diez segundos mediante AbortSignal", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
      expect(delay).toBe(10_000);
      const controller = new AbortController();
      setTimeout(() => controller.abort(), delay);
      return controller.signal;
    });
    setGoogleWalletTransportForTests(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("secreto")), {
            once: true,
          });
        }),
    );
    const promise = expect(googleWalletRequest("GET", "genericClass/test")).rejects.toThrow(
      "dentro del plazo",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;
    expect(timeout).toHaveBeenCalledOnce();
  });

  it("rechaza rutas externas antes de enviar credenciales y deshabilita red real en tests", async () => {
    const fake = vi.fn();
    setGoogleWalletTransportForTests(fake);
    await expect(googleWalletRequest("GET", "https://attacker.test")).rejects.toThrow("Ruta");
    expect(fake).not.toHaveBeenCalled();
    setGoogleWalletTransportForTests();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(googleWalletRequest("GET", "genericClass/test")).rejects.toThrow(
      "dentro del plazo",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sin credenciales falla antes del transporte", async () => {
    delete env.GOOGLE_WALLET_SA_KEY_BASE64;
    expect(isGoogleWalletConfigured()).toBe(false);
    const fake = vi.fn();
    setGoogleWalletTransportForTests(fake);
    expect(() => signSaveJwt({})).toThrow("sin configurar");
    await expect(googleWalletRequest("GET", "genericClass/test")).rejects.toThrow("sin configurar");
    expect(fake).not.toHaveBeenCalled();
  });
});
