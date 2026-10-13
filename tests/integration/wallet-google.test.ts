import { createPublicKey, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { type Env, getEnv } from "@/env";
import { ForbiddenError, getCarnetCredential, rotateCarnetTokenAs } from "@/modules/identity";
import { endMembership } from "@/modules/people/domain/membership";
import { outbox } from "@/modules/system/schema";
import { walletFailure } from "@/modules/wallet/domain/failure";
import {
  issueGoogleSaveUrl,
  refreshGooglePass,
  setGoogleWalletTransportForTests,
} from "@/modules/wallet/domain/google";
import * as passRecords from "@/modules/wallet/domain/passes";
import { listPassesFor } from "@/modules/wallet/domain/passes";
import { seedMember, seedMembership, seedPerson, seedTerm } from "../factories";
import credentials from "../fixtures/wallet/toy-credentials.json";
import { truncateAll } from "./db";
import { FakeGoogleWallet, walletActor, walletBarrier } from "./wallet-fixtures";

describe("emisión y reconciliación Google Wallet", () => {
  let server: FakeGoogleWallet;
  let original: Env;
  beforeEach(async () => {
    original = { ...getEnv() };
    getEnv().APP_URL = "https://oe-sintetica.example";
    server = new FakeGoogleWallet();
    setGoogleWalletTransportForTests(server.transport);
    await truncateAll();
  });
  afterEach(() => {
    setGoogleWalletTransportForTests();
    Object.assign(getEnv(), original);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(closeDb);

  it("reserva, crea clase y objeto, y firma un enlace mínimo sin exponer el QR en los claims", async () => {
    const personId = await seedMember("google-emision@eafit.edu.co", {
      firstName: "Alma",
      lastName: "Sintética",
    });
    const url = await issueGoogleSaveUrl(personId);
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    const jwt = url.slice("https://pay.google.com/gp/v/save/".length);
    const [header, payload, signature] = jwt.split(".") as [string, string, string];
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        createPublicKey(Buffer.from(credentials.googlePublicKey, "base64")),
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const [pass] = await listPassesFor(personId);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toMatchObject({
      iss: getEnv().GOOGLE_WALLET_SA_EMAIL,
      aud: "google",
      typ: "savetowallet",
      origins: ["https://oe-sintetica.example"],
      payload: { genericObjects: [{ id: pass?.externalId, classId: "1234567890.carnet-oe-test" }] },
    });
    expect(JSON.stringify(claims)).not.toContain("oe2.");
    expect(JSON.stringify(claims)).not.toContain("Alma");
    const credential = await getCarnetCredential(personId);
    expect(server.objects.get(pass?.externalId ?? "")).toMatchObject({
      header: { defaultValue: { value: "Alma Sintética" } },
      state: "ACTIVE",
      barcode: { value: credential?.token },
      logo: { sourceUri: { uri: "https://oe-sintetica.example/wallet/google-logo.png" } },
    });
    expect(pass).toMatchObject({ walletEpoch: 0, tokenRevision: 1, revokedAt: null });
    expect(pass?.issuedAt).toBeInstanceOf(Date);
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /oauth",
      "GET /genericClass/1234567890.carnet-oe-test",
      "POST /genericClass",
      `GET /genericObject/${pass?.externalId}`,
      "POST /genericObject",
    ]);
    for (const call of server.calls.filter((item) => item.path !== "/oauth")) {
      expect(new Headers(call.init.headers).get("Authorization")).toBe("Bearer oauth-sintetico");
    }
    expect(url.length).toBeLessThan(1800);
    await issueGoogleSaveUrl(personId);
    expect(server.calls.filter((call) => call.path === "/oauth")).toHaveLength(1);
    expect(server.calls.filter((call) => call.path.startsWith("/genericClass"))).toHaveLength(2);
    expect(server.writes().map((call) => call.method)).toEqual(["POST", "PUT"]);
    expect((await listPassesFor(personId))[0]?.issuedAt).toEqual(pass?.issuedAt);
  });

  it("recupera carreras 409 de clase y objeto mediante PATCH y PUT", async () => {
    const personId = await seedMember("google-conflicto@eafit.edu.co");
    server.intercept = async (call) => {
      if (call.method === "POST" && call.path === "/genericClass") {
        server.classes.set(String(call.body.id), { id: call.body.id });
        return Response.json({}, { status: 409 });
      }
      if (call.method === "POST" && call.path === "/genericObject") {
        server.objects.set(String(call.body.id), { id: call.body.id, state: "EXPIRED" });
        return Response.json({}, { status: 409 });
      }
      return undefined;
    };
    await issueGoogleSaveUrl(personId);
    expect(
      server.calls.some(
        (call) => call.method === "PATCH" && call.path.startsWith("/genericClass/"),
      ),
    ).toBe(true);
    expect(server.writes().map((call) => call.method)).toEqual(["POST", "PUT"]);
    const [pass] = await listPassesFor(personId);
    expect(server.objects.get(pass?.externalId ?? "")?.state).toBe("ACTIVE");
  });

  it("una clase fallida no queda memoizada y su reserva permanece pendiente", async () => {
    const personId = await seedMember("google-clase-fallida@eafit.edu.co");
    let fail = true;
    server.intercept = async (call) => {
      if (fail && call.path.startsWith("/genericClass/")) {
        fail = false;
        return Response.json({ error: "fallo sintético" }, { status: 503 });
      }
      return undefined;
    };
    await expect(issueGoogleSaveUrl(personId)).rejects.toMatchObject({
      reason: "PROVIDER_HTTP",
      status: 503,
      message: expect.stringContaining("HTTP 503"),
    });
    expect((await listPassesFor(personId))[0]).toMatchObject({
      issuedAt: null,
      lastIssuedAt: null,
    });
    await issueGoogleSaveUrl(personId);
    expect(
      server.calls.filter(
        (call) => call.method === "GET" && call.path.startsWith("/genericClass/"),
      ),
    ).toHaveLength(2);
    expect((await listPassesFor(personId))[0]?.issuedAt).toBeInstanceOf(Date);
  });

  it("conserva la reserva si Google crea el objeto pero se pierde la respuesta y luego reconcilia", async () => {
    const personId = await seedMember("google-respuesta-perdida@eafit.edu.co");
    server.intercept = async (call) => {
      if (call.path === "/genericObject" && call.method === "POST") {
        server.objects.set(String(call.body.id), structuredClone(call.body));
        throw new Error("Respuesta perdida con datos que no deben llegar al usuario");
      }
      return undefined;
    };
    await expect(issueGoogleSaveUrl(personId)).rejects.toMatchObject({
      reason: "PROVIDER_UNREACHABLE",
      message: expect.stringContaining("no respondió dentro del plazo"),
    });
    const [reservation] = await listPassesFor(personId);
    expect(reservation).toMatchObject({ issuedAt: null, lastIssuedAt: null, revokedAt: null });
    expect(server.objects.has(reservation?.externalId ?? "")).toBe(true);
    server.intercept = undefined;
    await refreshGooglePass(personId);
    const [confirmed] = await listPassesFor(personId);
    expect(confirmed?.id).toBe(reservation?.id);
    expect(confirmed?.issuedAt).toBeInstanceOf(Date);
    expect(confirmed?.lastRefreshedAt).toBeInstanceOf(Date);
    expect(server.writes().map((call) => call.method)).toEqual(["POST", "PUT"]);
  });

  it("conserva el identificador externo cuando falla el registro local después de un POST exitoso", async () => {
    const personId = await seedMember("google-registro-local-fallido@eafit.edu.co");
    vi.spyOn(passRecords, "recordPassIssued").mockRejectedValueOnce(
      new Error("Fallo local sintético"),
    );
    await expect(issueGoogleSaveUrl(personId)).rejects.toThrow("Fallo local sintético");
    // El fallo salió del registro local, que es donde la prueba lo puso.
    expect(passRecords.recordPassIssued).toHaveBeenCalled();
    const [reservation] = await listPassesFor(personId);
    expect(reservation).toMatchObject({ issuedAt: null, lastIssuedAt: null });
    expect(server.objects.has(reservation?.externalId ?? "")).toBe(true);
    await refreshGooglePass(personId);
    expect((await listPassesFor(personId))[0]?.issuedAt).toBeInstanceOf(Date);
    expect(server.writes().filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("un 404 revoca el registro y los jobs no recrean el objeto; una acción expresa sí puede", async () => {
    const personId = await seedMember("google-404@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    server.objects.clear();
    await refreshGooglePass(personId);
    expect((await listPassesFor(personId))[0]?.revokedAt).toBeInstanceOf(Date);
    const count = server.calls.length;
    await refreshGooglePass(personId);
    expect(server.calls).toHaveLength(count);
    await issueGoogleSaveUrl(personId);
    expect((await listPassesFor(personId))[0]?.revokedAt).toBeNull();
    expect(server.writes().filter((call) => call.method === "POST")).toHaveLength(2);
  });

  it("rotar durante un PUT no espera a Google y deja otra sincronización con la nueva revisión", async () => {
    const personId = await seedMember("google-rotacion-en-vuelo@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    const entered = walletBarrier();
    const finish = walletBarrier();
    let held = false;
    server.intercept = async (call) => {
      if (!held && call.path.startsWith("/genericObject/") && call.method === "PUT") {
        held = true;
        entered.release();
        await finish.promise;
      }
      return undefined;
    };
    const refresh = refreshGooglePass(personId);
    await entered.promise;
    let rotated: string | undefined;
    const rotation = rotateCarnetTokenAs(walletActor(personId)).then((token) => {
      rotated = token;
    });
    try {
      await vi.waitFor(() => expect(rotated).toBeTypeOf("string"), { timeout: 1000 });
    } finally {
      finish.release();
    }
    await Promise.all([refresh, rotation]);
    const queued = await getDb().select().from(outbox).where(eq(outbox.eventType, "wallet.sync"));
    expect(queued.length).toBeGreaterThan(0);
    await refreshGooglePass(personId);
    const [pass] = await listPassesFor(personId);
    expect(pass?.tokenRevision).toBe(2);
    expect(server.objects.get(pass?.externalId ?? "")).toMatchObject({
      barcode: { value: rotated },
    });
  });

  it("lo que la ruta registra distingue a Google caído, una credencial que Google no acepta y un fallo local", async () => {
    // Los errores son los que lanza la emisión de verdad; `walletFailure` es lo que la ruta escribe
    // de cada uno (DT-228, ADR-120 regla 13).
    const personId = await seedMember("google-causa-del-fallo@eafit.edu.co");
    const failureOf = async () => walletFailure(await issueGoogleSaveUrl(personId).catch((e) => e));

    server.intercept = async (call) =>
      call.path === "/oauth"
        ? Response.json({ error: "invalid_grant" }, { status: 400 })
        : undefined;
    expect(await failureOf()).toEqual({ reason: "PROVIDER_AUTH", status: 400 });

    server.intercept = async () => {
      throw new Error("oe2.secreto-del-transporte");
    };
    expect(await failureOf()).toEqual({ reason: "PROVIDER_UNREACHABLE" });

    server.intercept = async (call) =>
      call.path.startsWith("/genericObject") ? Response.json({}, { status: 503 }) : undefined;
    expect(await failureOf()).toEqual({ reason: "PROVIDER_HTTP", status: 503 });

    server.intercept = undefined;
    vi.spyOn(passRecords, "recordPassIssued").mockRejectedValueOnce(
      Object.assign(new Error("oe2.secreto-local"), { code: "57P01" }),
    );
    expect(await failureOf()).toEqual({
      reason: "UNEXPECTED",
      errorType: "Error",
      errorCode: "57P01",
    });
  });

  it("a quien está en licencia no se le emite, y la ruta no lo cuenta como fallo", async () => {
    // La reserva de la credencial rechaza a quien no participa antes de leer el carnet: lo que
    // llega a la ruta es un `ForbiddenError`, no el `DomainError` de quien no tiene carnet.
    const personId = await seedPerson("google-en-licencia@eafit.edu.co");
    await seedMembership(personId, await seedTerm(), "ON_LEAVE");
    const rejection: unknown = await issueGoogleSaveUrl(personId).catch((e) => e);
    expect(rejection).toBeInstanceOf(ForbiddenError);
    expect(walletFailure(rejection)).toEqual({ reason: "REFUSED", errorType: "ForbiddenError" });
    expect(await listPassesFor(personId)).toEqual([]);
    expect(server.calls).toEqual([]);
  });

  it("sin configuración no emite; retirarla después conserva el registro hasta restaurarla", async () => {
    const personId = await seedMember("google-configuracion@eafit.edu.co");
    delete getEnv().GOOGLE_WALLET_ISSUER_ID;
    await expect(issueGoogleSaveUrl(personId)).rejects.toMatchObject({
      reason: "NOT_CONFIGURED",
      message: expect.stringContaining("no está configurado"),
    });
    expect(await listPassesFor(personId)).toEqual([]);
    expect(await getCarnetCredential(personId)).toBeNull();
    Object.assign(getEnv(), original);
    await issueGoogleSaveUrl(personId);
    const [pass] = await listPassesFor(personId);
    delete getEnv().GOOGLE_WALLET_ISSUER_ID;
    await expect(refreshGooglePass(personId)).rejects.toMatchObject({
      reason: "NOT_CONFIGURED",
      message: expect.stringContaining("Sin credenciales"),
    });
    expect((await listPassesFor(personId))[0]?.externalId).toBe(pass?.externalId);
    Object.assign(getEnv(), original);
    await refreshGooglePass(personId);
    expect((await listPassesFor(personId))[0]?.lastRefreshedAt).toBeInstanceOf(Date);
  });

  it("dar de baja durante un PUT no espera a la red y después se expira el objeto", async () => {
    const personId = await seedMember("google-baja-en-vuelo@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    const entered = walletBarrier();
    const finish = walletBarrier();
    let held = false;
    server.intercept = async (call) => {
      if (!held && call.path.startsWith("/genericObject/") && call.method === "PUT") {
        held = true;
        entered.release();
        await finish.promise;
      }
      return undefined;
    };
    const refresh = refreshGooglePass(personId);
    await entered.promise;
    let ended = false;
    const ending = runCommand(SYSTEM_ACTOR, (ctx) =>
      endMembership(ctx, personId, {
        endReason: "OTHER",
        memorialConsent: false,
        contactConsent: false,
      }),
    ).then(() => {
      ended = true;
    });
    try {
      await vi.waitFor(() => expect(ended).toBe(true), { timeout: 1000 });
    } finally {
      finish.release();
    }
    await Promise.all([refresh, ending]);
    await refreshGooglePass(personId);
    const [pass] = await listPassesFor(personId);
    expect(pass?.revokedAt).toBeInstanceOf(Date);
    expect(server.objects.get(pass?.externalId ?? "")?.state).toBe("EXPIRED");
  });
});
